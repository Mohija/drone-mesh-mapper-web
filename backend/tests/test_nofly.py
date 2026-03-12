"""Tests for No-Fly Zone (DIPUL WMS) API endpoints."""

import json
import pytest
from unittest.mock import patch, MagicMock


class TestNoFlyCheck:
    """Tests for GET /api/nofly/check."""

    @patch("app.http_requests.get")
    def test_check_available(self, mock_get, client, auth_headers):
        """WMS available returns status."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_get.return_value = mock_resp

        res = client.get("/api/nofly/check", headers=auth_headers)
        assert res.status_code == 200
        data = res.get_json()
        assert data["available"] is True
        assert data["status_code"] == 200
        assert "wms_url" in data

    @patch("app.http_requests.get")
    def test_check_unavailable(self, mock_get, client, auth_headers):
        """WMS returns non-200 status."""
        mock_resp = MagicMock()
        mock_resp.status_code = 503
        mock_get.return_value = mock_resp

        res = client.get("/api/nofly/check", headers=auth_headers)
        assert res.status_code == 200
        data = res.get_json()
        assert data["available"] is False
        assert data["status_code"] == 503

    @patch("app.http_requests.get")
    def test_check_timeout(self, mock_get, client, auth_headers):
        """WMS request times out."""
        import requests
        mock_get.side_effect = requests.Timeout("Connection timed out")

        res = client.get("/api/nofly/check", headers=auth_headers)
        assert res.status_code == 200
        data = res.get_json()
        assert data["available"] is False
        assert data["error"] == "timeout"

    @patch("app.http_requests.get")
    def test_check_connection_error(self, mock_get, client, auth_headers):
        """WMS connection fails."""
        import requests
        mock_get.side_effect = requests.ConnectionError("DNS resolution failed")

        res = client.get("/api/nofly/check", headers=auth_headers)
        assert res.status_code == 200
        data = res.get_json()
        assert data["available"] is False
        assert "error" in data

    @patch("app.http_requests.get")
    def test_check_calls_correct_url(self, mock_get, client, auth_headers):
        """Verify correct WMS URL and params are used."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_get.return_value = mock_resp

        client.get("/api/nofly/check", headers=auth_headers)
        mock_get.assert_called_once()
        call_args = mock_get.call_args
        assert "uas-betrieb.de" in call_args[0][0]
        assert call_args[1]["params"]["service"] == "WMS"
        assert call_args[1]["params"]["request"] == "GetCapabilities"


class TestNoFlyFeatureInfo:
    """Tests for GET /api/nofly/info."""

    def test_missing_params(self, client, auth_headers):
        """Missing lat/lon/layers returns 400."""
        res = client.get("/api/nofly/info", headers=auth_headers)
        assert res.status_code == 400
        data = res.get_json()
        assert "error" in data

    def test_missing_lat(self, client, auth_headers):
        res = client.get("/api/nofly/info?lon=8.0&layers=dipul:flughaefen", headers=auth_headers)
        assert res.status_code == 400

    def test_missing_lon(self, client, auth_headers):
        res = client.get("/api/nofly/info?lat=52.0&layers=dipul:flughaefen", headers=auth_headers)
        assert res.status_code == 400

    def test_missing_layers(self, client, auth_headers):
        res = client.get("/api/nofly/info?lat=52.0&lon=8.0", headers=auth_headers)
        assert res.status_code == 400

    @patch("app.http_requests.get")
    def test_successful_feature_info(self, mock_get, client, auth_headers):
        """Successful GetFeatureInfo returns GeoJSON."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {"name": "Frankfurt Airport", "type": "flughafen"},
                    "geometry": {"type": "Point", "coordinates": [8.57, 50.03]},
                }
            ],
        }
        mock_resp.headers = {"content-type": "application/json"}
        mock_get.return_value = mock_resp

        res = client.get("/api/nofly/info?lat=50.03&lon=8.57&layers=dipul:flughaefen", headers=auth_headers)
        assert res.status_code == 200
        data = res.get_json()
        assert data["type"] == "FeatureCollection"
        assert len(data["features"]) == 1
        assert data["features"][0]["properties"]["name"] == "Frankfurt Airport"

    @patch("app.http_requests.get")
    def test_empty_feature_info(self, mock_get, client, auth_headers):
        """No features at location returns empty collection."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "type": "FeatureCollection",
            "features": [],
        }
        mock_resp.headers = {"content-type": "application/json"}
        mock_get.return_value = mock_resp

        res = client.get("/api/nofly/info?lat=52.0&lon=8.0&layers=dipul:flughaefen", headers=auth_headers)
        assert res.status_code == 200
        data = res.get_json()
        assert data["type"] == "FeatureCollection"
        assert len(data["features"]) == 0

    @patch("app.http_requests.get")
    def test_non_json_response(self, mock_get, client, auth_headers):
        """WMS returns non-JSON (e.g., HTML) - should handle gracefully."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.side_effect = ValueError("No JSON")
        mock_resp.headers = {"content-type": "text/html"}
        mock_get.return_value = mock_resp

        res = client.get("/api/nofly/info?lat=52.0&lon=8.0&layers=dipul:flughaefen", headers=auth_headers)
        assert res.status_code == 200
        data = res.get_json()
        assert data["type"] == "FeatureCollection"
        assert len(data["features"]) == 0
        assert data["raw_content_type"] == "text/html"

    @patch("app.http_requests.get")
    def test_wms_error_status(self, mock_get, client, auth_headers):
        """WMS returns error status code."""
        mock_resp = MagicMock()
        mock_resp.status_code = 500
        mock_get.return_value = mock_resp

        res = client.get("/api/nofly/info?lat=52.0&lon=8.0&layers=dipul:flughaefen", headers=auth_headers)
        assert res.status_code == 502
        data = res.get_json()
        assert "error" in data

    @patch("app.http_requests.get")
    def test_timeout(self, mock_get, client, auth_headers):
        """WMS request times out."""
        import requests
        mock_get.side_effect = requests.Timeout("Timed out")

        res = client.get("/api/nofly/info?lat=52.0&lon=8.0&layers=dipul:flughaefen", headers=auth_headers)
        assert res.status_code == 504
        data = res.get_json()
        assert data["error"] == "timeout"

    @patch("app.http_requests.get")
    def test_connection_error(self, mock_get, client, auth_headers):
        """WMS connection fails."""
        import requests
        mock_get.side_effect = requests.ConnectionError("Connection refused")

        res = client.get("/api/nofly/info?lat=52.0&lon=8.0&layers=dipul:flughaefen", headers=auth_headers)
        assert res.status_code == 502
        data = res.get_json()
        assert "error" in data

    @patch("app.http_requests.get")
    def test_correct_wms_params(self, mock_get, client, auth_headers):
        """Verify correct WMS GetFeatureInfo params are sent."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"type": "FeatureCollection", "features": []}
        mock_resp.headers = {"content-type": "application/json"}
        mock_get.return_value = mock_resp

        client.get("/api/nofly/info?lat=52.0302&lon=8.5325&layers=dipul:kontrollzonen", headers=auth_headers)
        call_args = mock_get.call_args
        params = call_args[1]["params"]
        assert params["service"] == "WMS"
        assert params["version"] == "1.3.0"
        assert params["request"] == "GetFeatureInfo"
        assert params["layers"] == "dipul:kontrollzonen"
        assert params["query_layers"] == "dipul:kontrollzonen"
        assert params["crs"] == "EPSG:4326"
        assert params["info_format"] == "application/json"
        assert params["i"] == 50
        assert params["j"] == 50
        assert params["width"] == 101
        assert params["height"] == 101

    @patch("app.http_requests.get")
    def test_multiple_layers(self, mock_get, client, auth_headers):
        """Multiple comma-separated layers are passed correctly."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"type": "FeatureCollection", "features": []}
        mock_resp.headers = {"content-type": "application/json"}
        mock_get.return_value = mock_resp

        layers = "dipul:flughaefen,dipul:kontrollzonen,dipul:naturschutzgebiete"
        client.get(f"/api/nofly/info?lat=52.0&lon=8.0&layers={layers}", headers=auth_headers)
        call_args = mock_get.call_args
        assert call_args[1]["params"]["layers"] == layers

    @patch("app.http_requests.get")
    def test_bbox_constructed_correctly(self, mock_get, client, auth_headers):
        """Verify bbox is centered on the requested coordinates."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"type": "FeatureCollection", "features": []}
        mock_resp.headers = {"content-type": "application/json"}
        mock_get.return_value = mock_resp

        client.get("/api/nofly/info?lat=52.0&lon=8.0&layers=dipul:flughaefen", headers=auth_headers)
        call_args = mock_get.call_args
        bbox = call_args[1]["params"]["bbox"]
        parts = [float(x) for x in bbox.split(",")]
        # bbox should be lat-delta, lon-delta, lat+delta, lon+delta
        assert abs(parts[0] - 51.999) < 0.01
        assert abs(parts[1] - 7.999) < 0.01
        assert abs(parts[2] - 52.001) < 0.01
        assert abs(parts[3] - 8.001) < 0.01
