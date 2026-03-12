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
    tenant_id = db.Column(db.String(8), db.ForeignKey("tenants.id"), nullable=True)  # NULL for super_admin
    last_login = db.Column(db.Float, nullable=True)
    created_at = db.Column(db.Float, default=_now, nullable=False)
    updated_at = db.Column(db.Float, default=_now, onupdate=_now, nullable=False)

    def to_dict(self, include_tenant=False):
        result = {
            "id": self.id,
            "username": self.username,
            "email": self.email,
            "display_name": self.display_name,
            "role": self.role,
            "is_active": self.is_active,
            "tenant_id": self.tenant_id,
            "last_login": self.last_login,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }
        if include_tenant and self.tenant:
            result["tenant_name"] = self.tenant.display_name
        elif include_tenant:
            result["tenant_name"] = None
        return result


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
