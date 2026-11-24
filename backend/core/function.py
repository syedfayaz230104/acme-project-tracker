"""
AWS Lambda entry point for the ACME project management API.

Terraform deploys this folder as a single Lambda function (``function.handler``).
All HTTP routing, authentication and business logic live in the ``app`` package.
"""

import logging
import os
import sys

# LocalStack hot-reload mounts this folder as-is, so third-party packages are
# vendored into .vendor/ for local runs (see README). In AWS, Terraform installs
# requirements.txt into the package and excludes dot-folders, so this is a no-op.
_VENDOR = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".vendor")
if os.path.isdir(_VENDOR):
    sys.path.insert(0, _VENDOR)

from app.router import dispatch  # noqa: E402

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event: dict | None = None, context: object | None = None) -> dict:
    """Handle a Lambda Function URL (payload v2) event and return an HTTP response."""
    return dispatch(event or {})
