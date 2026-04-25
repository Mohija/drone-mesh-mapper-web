"""Curated payload-template library for alarm interfaces.

Each template is a starting point — admins customise it after applying. We
don't try to be exhaustive about each external system's full schema; we ship
the field names that get a useful first message through, and document where
to extend. The Mustache placeholders match the variables in
services/alarm_dispatcher.build_variable_pool().
"""
from __future__ import annotations


def _alamos_fe2() -> dict:
    """Alamos FE2 external interface — sends an alarm to a control room.

    See https://alamos-support.atlassian.net/wiki/spaces/documentation/pages/219480068
    The address field maps to the unit code; we put the drone id there as a
    pragmatic default. Admins typically replace it with a fixed unit address
    for their fire/police dispatch.
    """
    return {
        "id": "alamos_fe2",
        "label": "Alamos FE2 — Externe Schnittstelle",
        "description": (
            "POST mit JSON-Payload an die FE2-Externe-Schnittstelle. "
            "Erwartet keyword + units[].address. Admins sollten address "
            "vor Produktivnutzung auf den festen Einheits-Code ersetzen."
        ),
        "category": "alerting",
        "interfaceType": "webhook",
        "httpMethod": "POST",
        "extraHeaders": {"Content-Type": "application/json; charset=UTF-8"},
        "authType": "none",
        "payloadTemplate": {
            "keyword": "Drohne in Sperrzone",
            "units": [{"address": "{{drone.id}}"}],
            "note": "{{drone.name}} hat „{{zone.name}}\" verletzt",
            "address": {
                "street": "{{zone.name}}",
                "info": "Lat {{drone.latitude}}, Lon {{drone.longitude}}",
            },
            "timestamp": "{{system.now_iso}}",
        },
    }


def _slack_webhook() -> dict:
    """Incoming Slack-Webhook — postet eine Nachricht in einen Kanal."""
    return {
        "id": "slack_webhook",
        "label": "Slack — Incoming Webhook",
        "description": (
            "Postet eine Nachricht in den verbundenen Slack-Kanal. "
            "URL ist die Webhook-URL aus der Slack-App-Konfiguration."
        ),
        "category": "chat",
        "interfaceType": "webhook",
        "httpMethod": "POST",
        "extraHeaders": {},
        "authType": "none",
        "payloadTemplate": {
            "text": "🚨 *{{trigger}}* — {{drone.name}} hat „{{zone.name}}\" verletzt ({{system.now_iso}})",
            "blocks": [
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": "*Drohne:* {{drone.name}} ({{drone.id}})\n*Zone:* {{zone.name}}\n*Position:* {{drone.latitude}}, {{drone.longitude}} @ {{drone.altitude}} m",
                    },
                },
            ],
        },
    }


def _discord_webhook() -> dict:
    """Discord-Webhook — Embed mit Verstoßdaten."""
    return {
        "id": "discord_webhook",
        "label": "Discord — Webhook",
        "description": (
            "Postet ein Embed in den verbundenen Discord-Kanal. "
            "URL ist die Webhook-URL aus den Channel-Integrationseinstellungen."
        ),
        "category": "chat",
        "interfaceType": "webhook",
        "httpMethod": "POST",
        "extraHeaders": {},
        "authType": "none",
        "payloadTemplate": {
            "username": "FlightArc",
            "content": "🛸 Verstoß erkannt",
            "embeds": [
                {
                    "title": "{{drone.name}} in {{zone.name}}",
                    "description": "Verstoß wurde durch FlightArc erkannt.",
                    "color": 15158332,
                    "fields": [
                        {"name": "Drohne", "value": "{{drone.id}}", "inline": True},
                        {"name": "Zone", "value": "{{zone.name}}", "inline": True},
                        {"name": "Höhe", "value": "{{drone.altitude}} m", "inline": True},
                    ],
                    "timestamp": "{{system.now_iso}}",
                },
            ],
        },
    }


def _ms_teams() -> dict:
    """MS Teams — Adaptive Card via Incoming Webhook."""
    return {
        "id": "ms_teams",
        "label": "MS Teams — Webhook (Adaptive Card)",
        "description": (
            "Postet eine Adaptive Card in einen Teams-Kanal. URL ist die "
            "Connector-Webhook-URL aus den Kanal-Einstellungen."
        ),
        "category": "chat",
        "interfaceType": "webhook",
        "httpMethod": "POST",
        "extraHeaders": {},
        "authType": "none",
        "payloadTemplate": {
            "type": "message",
            "attachments": [
                {
                    "contentType": "application/vnd.microsoft.card.adaptive",
                    "content": {
                        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                        "type": "AdaptiveCard",
                        "version": "1.4",
                        "body": [
                            {"type": "TextBlock", "size": "Large", "weight": "Bolder",
                             "text": "Drohne in Sperrzone"},
                            {"type": "FactSet", "facts": [
                                {"title": "Drohne:", "value": "{{drone.name}} ({{drone.id}})"},
                                {"title": "Zone:", "value": "{{zone.name}}"},
                                {"title": "Position:",
                                 "value": "{{drone.latitude}}, {{drone.longitude}} @ {{drone.altitude}} m"},
                                {"title": "Zeitpunkt:", "value": "{{system.now_iso}}"},
                            ]},
                        ],
                    },
                },
            ],
        },
    }


def _generic() -> dict:
    """Vendor-neutraler Webhook — kompakter, vorhersehbarer JSON-Aufbau."""
    return {
        "id": "generic",
        "label": "Generic — JSON-Webhook",
        "description": (
            "Vendor-neutrales JSON-Schema. Eignet sich als Ausgangspunkt "
            "für eigene Integrationen oder unbekannte Drittsysteme."
        ),
        "category": "general",
        "interfaceType": "webhook",
        "httpMethod": "POST",
        "extraHeaders": {},
        "authType": "bearer",
        "payloadTemplate": {
            "event": "{{trigger}}",
            "drone": {
                "id": "{{drone.id}}",
                "name": "{{drone.name}}",
                "latitude": "${{drone.latitude}}",
                "longitude": "${{drone.longitude}}",
                "altitude": "${{drone.altitude}}",
            },
            "zone": {
                "id": "{{zone.id}}",
                "name": "{{zone.name}}",
            },
            "violationId": "{{violation.id}}",
            "timestamp": "{{system.now_iso}}",
        },
    }


def _subscription_starter() -> dict:
    """Starter for the new subscription channel type."""
    return {
        "id": "subscription_starter",
        "label": "Subscription — Pub/Sub-Channel",
        "description": (
            "Drittsysteme registrieren ihre Callback-URL einmalig per API-Key, "
            "danach pusht FlightArc jedes Event automatisch an alle Subscriber. "
            "Mehrere Subscriber pro Kanal möglich."
        ),
        "category": "general",
        "interfaceType": "subscription",
        "httpMethod": "POST",
        "extraHeaders": {},
        "authType": "none",
        "payloadTemplate": {
            "event": "{{trigger}}",
            "drone": {
                "id": "{{drone.id}}",
                "name": "{{drone.name}}",
                "position": {
                    "lat": "${{drone.latitude}}",
                    "lon": "${{drone.longitude}}",
                    "alt": "${{drone.altitude}}",
                },
            },
            "zone": {"id": "{{zone.id}}", "name": "{{zone.name}}"},
            "violation": {
                "id": "{{violation.id}}",
                "startedAt": "{{violation.start_time_iso}}",
                "active": "${{violation.is_active}}",
            },
            "publishedAt": "{{system.now_iso}}",
        },
    }


_TEMPLATES = [
    _alamos_fe2(), _slack_webhook(), _discord_webhook(),
    _ms_teams(), _generic(), _subscription_starter(),
]


def list_templates() -> list[dict]:
    return _TEMPLATES


def get_template(template_id: str) -> dict | None:
    for t in _TEMPLATES:
        if t["id"] == template_id:
            return t
    return None
