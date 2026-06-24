from rest_framework.views import exception_handler
from rest_framework.exceptions import APIException
from rest_framework import status
from rest_framework.response import Response

class BusinessValidationError(APIException):
    """
    A custom exception for business logic errors and edge cases.
    """
    status_code = status.HTTP_400_BAD_REQUEST

    def __init__(self, code, message, edge_case_ref=None, status_code=status.HTTP_400_BAD_REQUEST):
        self.status_code = status_code
        self.detail = {
            "code": code,
            "message": message,
            "edge_case_ref": edge_case_ref
        }
        super().__init__(detail=self.detail)


def custom_exception_handler(exc, context):
    # Call DRF's default exception handler first to get the standard error response.
    response = exception_handler(exc, context)

    if response is not None:
        # If the exception is our custom BusinessValidationError, format it directly
        if isinstance(exc, BusinessValidationError):
            response.data = {
                "error": exc.detail
            }
        else:
            # For other DRF exceptions (like ValidationError, PermissionDenied, NotAuthenticated, etc.)
            # convert them into the standard envelope.
            message = response.data
            code = "VALIDATION_ERROR"
            
            if response.status_code == 403:
                code = "PERMISSION_DENIED"
                message = message.get("detail", "You do not have permission to perform this action.")
            elif response.status_code == 401:
                code = "NOT_AUTHENTICATED"
                message = message.get("detail", "Authentication credentials were not provided.")
            elif response.status_code == 404:
                code = "NOT_FOUND"
                message = message.get("detail", "Resource not found.")
            elif isinstance(message, dict):
                # Standard serializer validation errors: extract the first field/error
                first_key = list(message.keys())[0]
                first_val = message[first_key]
                if isinstance(first_val, list):
                    first_val = first_val[0]
                # If first_val is a dict or nested, serialize as string
                message = f"{first_key}: {first_val}"
            elif isinstance(message, list):
                message = message[0]

            response.data = {
                "error": {
                    "code": code,
                    "message": str(message),
                    "edge_case_ref": getattr(exc, 'edge_case_ref', None)
                }
            }

    return response
