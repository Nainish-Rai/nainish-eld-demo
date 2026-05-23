"""
This app is intentionally stateless.

Trip plans, route lookups, and rendered logs are generated on demand and returned
in the response instead of being persisted in the database.
"""
