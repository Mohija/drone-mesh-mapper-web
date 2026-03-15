"""
Simulation routes — Create, start, stop and manage dummy receiver instances.
"""

import logging

from flask import Blueprint, g, jsonify, request
from auth import login_required, role_required

logger = logging.getLogger("simulation")

simulation_bp = Blueprint("simulation", __name__, url_prefix="/api/simulation")


def _get_manager():
    from flask import current_app
    mgr = current_app.config.get("_sim_manager")
    if not mgr:
        return None
    return mgr


@simulation_bp.route("/instances", methods=["GET"])
@login_required
@role_required("tenant_admin")
def list_instances():
    mgr = _get_manager()
    if not mgr:
        return jsonify({"error": "SimulationManager nicht verfügbar"}), 500
    return jsonify(mgr.list_simulators(g.tenant_id))


@simulation_bp.route("/instances", methods=["POST"])
@login_required
@role_required("tenant_admin")
def create_instance():
    mgr = _get_manager()
    if not mgr:
        return jsonify({"error": "SimulationManager nicht verfügbar"}), 500

    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Name erforderlich"}), 400

    num_drones = min(max(int(data.get("numDrones", 3)), 1), 50)
    lat = float(data.get("lat", 52.0302))
    lon = float(data.get("lon", 8.5325))
    hardware_type = data.get("hardwareType", "esp32-s3")

    from models import ReceiverNode
    if hardware_type not in ReceiverNode.HARDWARE_TYPES:
        return jsonify({"error": "Ungültiger Hardware-Typ"}), 400

    result = mgr.create_simulator(
        tenant_id=g.tenant_id,
        name=name,
        num_drones=num_drones,
        lat=lat,
        lon=lon,
        hardware_type=hardware_type,
    )
    return jsonify(result), 201


@simulation_bp.route("/instances/<sim_id>", methods=["GET"])
@login_required
@role_required("tenant_admin")
def get_instance(sim_id: str):
    mgr = _get_manager()
    if not mgr:
        return jsonify({"error": "SimulationManager nicht verfügbar"}), 500
    result = mgr.get_simulator(sim_id)
    if not result:
        return jsonify({"error": "Simulator nicht gefunden"}), 404
    return jsonify(result)


@simulation_bp.route("/instances/<sim_id>", methods=["DELETE"])
@login_required
@role_required("tenant_admin")
def delete_instance(sim_id: str):
    mgr = _get_manager()
    if not mgr:
        return jsonify({"error": "SimulationManager nicht verfügbar"}), 500
    if not mgr.delete_simulator(sim_id):
        return jsonify({"error": "Simulator nicht gefunden"}), 404
    return jsonify({"ok": True})


@simulation_bp.route("/instances/<sim_id>/start", methods=["POST"])
@login_required
@role_required("tenant_admin")
def start_instance(sim_id: str):
    mgr = _get_manager()
    if not mgr:
        return jsonify({"error": "SimulationManager nicht verfügbar"}), 500
    result = mgr.start_simulator(sim_id)
    if not result:
        return jsonify({"error": "Simulator nicht gefunden"}), 404
    return jsonify(result)


@simulation_bp.route("/instances/<sim_id>/stop", methods=["POST"])
@login_required
@role_required("tenant_admin")
def stop_instance(sim_id: str):
    mgr = _get_manager()
    if not mgr:
        return jsonify({"error": "SimulationManager nicht verfügbar"}), 500
    result = mgr.stop_simulator(sim_id)
    if not result:
        return jsonify({"error": "Simulator nicht gefunden"}), 404
    return jsonify(result)


@simulation_bp.route("/stop-all", methods=["POST"])
@login_required
@role_required("tenant_admin")
def stop_all():
    mgr = _get_manager()
    if not mgr:
        return jsonify({"error": "SimulationManager nicht verfügbar"}), 500
    mgr.stop_all(tenant_id=g.tenant_id)
    return jsonify({"ok": True})
