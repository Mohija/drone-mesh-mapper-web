"""
SQLAlchemy models for FlightArc multi-tenant system.
"""

import time
import uuid

from database import db
from sqlalchemy import JSON


def _uuid8():
    return str(uuid.uuid4())[:8]


def _now():
    return time.time()


class Tenant(db.Model):
    __tablename__ = "tenants"

    id = db.Column(db.String(8), primary_key=True, default=_uuid8)
    name = db.Column(db.String(100), unique=True, nullable=False)
    display_name = db.Column(db.String(200), nullable=False)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.Float, default=_now, nullable=False)
    updated_at = db.Column(db.Float, default=_now, onupdate=_now, nullable=False)

    # Relationships
    users = db.relationship("User", backref="tenant", cascade="all, delete-orphan", lazy=True)
    settings = db.relationship("TenantSettings", backref="tenant", uselist=False, cascade="all, delete-orphan", lazy=True)
    flight_zones = db.relationship("FlightZone", backref="tenant", cascade="all, delete-orphan", lazy=True)
    trail_archives = db.relationship("TrailArchive", backref="tenant", cascade="all, delete-orphan", lazy=True)
    violation_records = db.relationship("ViolationRecord", backref="tenant", cascade="all, delete-orphan", lazy=True)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "display_name": self.display_name,
            "is_active": self.is_active,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.String(8), primary_key=True, default=_uuid8)
    username = db.Column(db.String(100), unique=True, nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    display_name = db.Column(db.String(200), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="user")  # super_admin, tenant_admin, user
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    tenant_id = db.Column(db.String(8), db.ForeignKey("tenants.id"), nullable=True)  # default tenant (NULL for super_admin)
    last_login = db.Column(db.Float, nullable=True)
    created_at = db.Column(db.Float, default=_now, nullable=False)
    updated_at = db.Column(db.Float, default=_now, onupdate=_now, nullable=False)

    # Relationships
    memberships = db.relationship("UserTenantMembership", backref="user", cascade="all, delete-orphan", lazy=True)

    def to_dict(self, include_tenant=False, tenant_id=None):
        result = {
            "id": self.id,
            "username": self.username,
            "email": self.email,
            "display_name": self.display_name,
            "role": self.role,
            "is_active": self.is_active,
            "tenant_id": tenant_id or self.tenant_id,
            "last_login": self.last_login,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }
        if include_tenant:
            # If a specific tenant_id is given, look up its name
            if tenant_id:
                t = db.session.get(Tenant, tenant_id)
                result["tenant_name"] = t.display_name if t else None
            elif self.tenant:
                result["tenant_name"] = self.tenant.display_name
            else:
                result["tenant_name"] = None
        return result

    def get_tenants(self):
        """Return list of tenants this user has access to (via memberships)."""
        if self.role == "super_admin":
            return [t.to_dict() for t in Tenant.query.filter_by(is_active=True).all()]
        return [
            {**m.tenant.to_dict(), "membership_role": m.role}
            for m in self.memberships
            if m.tenant and m.tenant.is_active
        ]

    def get_role_for_tenant(self, tenant_id: str) -> str | None:
        """Get the user's effective role for a specific tenant."""
        if self.role == "super_admin":
            return "super_admin"
        for m in self.memberships:
            if m.tenant_id == tenant_id:
                return m.role
        return None


class UserTenantMembership(db.Model):
    """Many-to-many: a user can belong to multiple tenants with per-tenant roles."""
    __tablename__ = "user_tenant_memberships"

    id = db.Column(db.String(8), primary_key=True, default=_uuid8)
    user_id = db.Column(db.String(8), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    tenant_id = db.Column(db.String(8), db.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="user")  # tenant_admin, user
    created_at = db.Column(db.Float, default=_now, nullable=False)

    __table_args__ = (
        db.UniqueConstraint("user_id", "tenant_id", name="uq_user_tenant"),
    )

    tenant = db.relationship("Tenant")

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "tenant_id": self.tenant_id,
            "role": self.role,
            "tenant_name": self.tenant.display_name if self.tenant else None,
            "created_at": self.created_at,
        }


class TenantSettings(db.Model):
    __tablename__ = "tenant_settings"

    id = db.Column(db.String(8), primary_key=True, default=_uuid8)
    tenant_id = db.Column(db.String(8), db.ForeignKey("tenants.id"), unique=True, nullable=False)
    sources = db.Column(JSON, nullable=False, default=dict)
    center_lat = db.Column(db.Float, nullable=True)
    center_lon = db.Column(db.Float, nullable=True)
    radius = db.Column(db.Float, nullable=True)
    created_at = db.Column(db.Float, default=_now, nullable=False)
    updated_at = db.Column(db.Float, default=_now, onupdate=_now, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "tenant_id": self.tenant_id,
            "sources": self.sources or {},
            "center_lat": self.center_lat,
            "center_lon": self.center_lon,
            "radius": self.radius,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


class FlightZone(db.Model):
    __tablename__ = "flight_zones"

    id = db.Column(db.String(8), primary_key=True, default=_uuid8)
    tenant_id = db.Column(db.String(8), db.ForeignKey("tenants.id"), nullable=False)
    name = db.Column(db.String(200), nullable=False)
    color = db.Column(db.String(20), default="#3b82f6", nullable=False)
    polygon = db.Column(JSON, nullable=False, default=list)
    min_altitude_agl = db.Column(db.Float, nullable=True)
    max_altitude_agl = db.Column(db.Float, nullable=True)
    assigned_drones = db.Column(JSON, nullable=False, default=list)
    created_at = db.Column(db.Float, default=_now, nullable=False)
    updated_at = db.Column(db.Float, default=_now, onupdate=_now, nullable=False)

    def to_dict(self):
        """Return dict compatible with existing API format (camelCase)."""
        return {
            "id": self.id,
            "name": self.name,
            "color": self.color,
            "polygon": self.polygon or [],
            "minAltitudeAGL": self.min_altitude_agl,
            "maxAltitudeAGL": self.max_altitude_agl,
            "assignedDrones": self.assigned_drones or [],
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
        }


class ViolationRecord(db.Model):
    """Shared violation records — persisted in DB so all tenant users see the same data."""
    __tablename__ = "violation_records"

    id = db.Column(db.String(8), primary_key=True, default=_uuid8)
    tenant_id = db.Column(db.String(8), db.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    drone_id = db.Column(db.String(100), nullable=False)
    drone_name = db.Column(db.String(200), nullable=False)
    zone_id = db.Column(db.String(8), nullable=False)  # no FK — zone may be deleted
    zone_name = db.Column(db.String(200), nullable=False)
    zone_color = db.Column(db.String(20), default="#ef4444", nullable=False)
    zone_polygon = db.Column(JSON, nullable=True)  # snapshot of zone polygon at violation time
    start_time = db.Column(db.Float, nullable=False, default=_now)
    end_time = db.Column(db.Float, nullable=True)  # NULL = still active
    # Trail data: list of {lat, lon, alt, speed, battery, signal, heading, timestamp}
    trail_data = db.Column(JSON, nullable=False, default=list)
    comments = db.Column(db.Text, nullable=True)

    def to_dict(self, include_trail=False):
        result = {
            "id": self.id,
            "droneId": self.drone_id,
            "droneName": self.drone_name,
            "zoneId": self.zone_id,
            "zoneName": self.zone_name,
            "zoneColor": self.zone_color,
            "zonePolygon": self.zone_polygon,
            "startTime": self.start_time,
            "endTime": self.end_time,
            "trailPointCount": len(self.trail_data or []),
            "comments": self.comments,
        }
        if include_trail:
            result["trailData"] = self.trail_data or []
        return result


class TrailArchive(db.Model):
    __tablename__ = "trail_archives"

    id = db.Column(db.String(8), primary_key=True, default=_uuid8)
    tenant_id = db.Column(db.String(8), db.ForeignKey("tenants.id"), nullable=False)
    drone_id = db.Column(db.String(100), nullable=False)
    drone_name = db.Column(db.String(200), nullable=False, default="")
    source = db.Column(db.String(50), nullable=True)
    color = db.Column(db.String(20), default="#f97316", nullable=False)
    trail = db.Column(JSON, nullable=False, default=list)
    started_at = db.Column(db.Float, nullable=False, default=_now)
    archived_at = db.Column(db.Float, nullable=False, default=_now)
    expires_at = db.Column(db.Float, nullable=False)

    def to_dict(self, include_trail=True):
        """Return dict compatible with existing API format."""
        result = {
            "id": self.id,
            "droneId": self.drone_id,
            "droneName": self.drone_name,
            "source": self.source,
            "color": self.color,
            "startedAt": self.started_at,
            "archivedAt": self.archived_at,
            "expiresAt": self.expires_at,
            "pointCount": len(self.trail or []),
        }
        if include_trail:
            result["trail"] = self.trail or []
        return result
