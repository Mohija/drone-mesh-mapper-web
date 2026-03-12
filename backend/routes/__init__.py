"""Blueprint registration for FlightArc routes."""


def register_blueprints(app):
    """Register all route blueprints with the Flask app."""
    from routes.auth_routes import auth_bp
    from routes.admin_routes import admin_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(admin_bp)
