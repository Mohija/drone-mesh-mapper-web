"""Drone Address Book routes — per-tenant drone identifier <-> custom name mapping."""

import logging
import time
from flask import Blueprint, g, jsonify, request
from database import db
from models import DroneAddressBookEntry
from auth import login_required
from services.audit import audit_log

logger = logging.getLogger("addressbook")

addressbook_bp = Blueprint("addressbook", __name__, url_prefix="/api/addressbook")

# In-memory version counter per tenant (same pattern as zones/settings)
_versions: dict[str, int] = {}


def get_version(tenant_id: str) -> int:
    return _versions.get(tenant_id, 0)


def _bump_version(tenant_id: str):
    _versions[tenant_id] = _versions.get(tenant_id, 0) + 1


@addressbook_bp.route("", methods=["GET"])
@login_required
def list_entries():
    """Get all address book entries for the current tenant."""
    tid = g.tenant_id
    entries = DroneAddressBookEntry.query.filter_by(tenant_id=tid).order_by(DroneAddressBookEntry.custom_name).all()
    return jsonify([e.to_dict() for e in entries])


@addressbook_bp.route("", methods=["POST"])
@login_required
def create_entry():
    """Create a new address book entry."""
    tid = g.tenant_id
    data = request.get_json(silent=True) or {}

    identifier = (data.get("identifier") or "").strip()
    custom_name = (data.get("customName") or "").strip()

    if not identifier or not custom_name:
        return jsonify({"error": "identifier und customName erforderlich"}), 400

    # Check duplicate
    existing = DroneAddressBookEntry.query.filter_by(tenant_id=tid, identifier=identifier).first()
    if existing:
        return jsonify({"error": f"Kennung '{identifier}' ist bereits im Adressbuch"}), 409

    entry = DroneAddressBookEntry(
        tenant_id=tid,
        identifier=identifier,
        custom_name=custom_name,
        notes=(data.get("notes") or "").strip() or None,
    )
    db.session.add(entry)
    db.session.commit()

    _bump_version(tid)
    audit_log("create", "addressbook", entry.id, custom_name, {"identifier": identifier})
    logger.info("Address book entry created: %s -> %s", identifier, custom_name)
    return jsonify(entry.to_dict()), 201


@addressbook_bp.route("/<entry_id>", methods=["PUT"])
@login_required
def update_entry(entry_id):
    """Update an address book entry."""
    tid = g.tenant_id
    entry = DroneAddressBookEntry.query.filter_by(id=entry_id, tenant_id=tid).first()
    if not entry:
        return jsonify({"error": "Eintrag nicht gefunden"}), 404

    data = request.get_json(silent=True) or {}
    changes = {}

    if "customName" in data:
        new_name = (data["customName"] or "").strip()
        if not new_name:
            return jsonify({"error": "customName darf nicht leer sein"}), 400
        if new_name != entry.custom_name:
            changes["customName"] = {"old": entry.custom_name, "new": new_name}
            entry.custom_name = new_name

    if "identifier" in data:
        new_id = (data["identifier"] or "").strip()
        if not new_id:
            return jsonify({"error": "identifier darf nicht leer sein"}), 400
        if new_id != entry.identifier:
            # Check duplicate
            dup = DroneAddressBookEntry.query.filter_by(tenant_id=tid, identifier=new_id).first()
            if dup:
                return jsonify({"error": f"Kennung '{new_id}' ist bereits im Adressbuch"}), 409
            changes["identifier"] = {"old": entry.identifier, "new": new_id}
            entry.identifier = new_id

    if "notes" in data:
        entry.notes = (data["notes"] or "").strip() or None

    entry.updated_at = time.time()
    db.session.commit()

    _bump_version(tid)
    if changes:
        audit_log("update", "addressbook", entry.id, entry.custom_name, changes)
    logger.info("Address book entry updated: %s", entry_id)
    return jsonify(entry.to_dict())


@addressbook_bp.route("/<entry_id>", methods=["DELETE"])
@login_required
def delete_entry(entry_id):
    """Delete an address book entry."""
    tid = g.tenant_id
    entry = DroneAddressBookEntry.query.filter_by(id=entry_id, tenant_id=tid).first()
    if not entry:
        return jsonify({"error": "Eintrag nicht gefunden"}), 404

    name = entry.custom_name
    identifier = entry.identifier
    db.session.delete(entry)
    db.session.commit()

    _bump_version(tid)
    audit_log("delete", "addressbook", entry_id, name, {"identifier": identifier})
    logger.info("Address book entry deleted: %s (%s)", identifier, name)
    return jsonify({"ok": True})


@addressbook_bp.route("/suggestions", methods=["GET"])
@login_required
def get_suggestions():
    """Get currently scanned drones as suggestions for the address book."""
    tid = g.tenant_id

    # Import here to avoid circular imports
    from app import registry, settings, DEFAULT_LAT, DEFAULT_LON

    enabled = settings.get_enabled_sources(tenant_id=tid)
    all_drones = registry.get_all_drones(DEFAULT_LAT, DEFAULT_LON, 0, enabled, tenant_id=tid)

    # Get existing identifiers to exclude
    existing = {e.identifier for e in DroneAddressBookEntry.query.filter_by(tenant_id=tid).all()}

    suggestions = []
    seen = set()
    for d in all_drones:
        basic_id = d.get("basic_id", "")
        if not basic_id or basic_id in existing or basic_id in seen:
            continue
        seen.add(basic_id)
        suggestions.append({
            "identifier": basic_id,
            "currentName": d.get("name", basic_id),
            "source": d.get("source", ""),
            "sourceLabel": d.get("source_label", ""),
        })

    return jsonify(suggestions)
