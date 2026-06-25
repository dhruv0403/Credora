import time
import json
import logging
import uuid
import traceback
from django.utils.timezone import now

logger = logging.getLogger('api.request')

REDACTED_KEYS = {'password', 'token', 'secret', 'password_confirm', 'new_password', 'old_password', 'authorization', 'access', 'refresh'}

def _redact_dict(data):
    if isinstance(data, dict):
        return {k: "[REDACTED]" if k.lower() in REDACTED_KEYS else _redact_dict(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [_redact_dict(item) for item in data]
    return data

def _get_request_body(request):
    try:
        content_type = request.content_type or ""
        if "multipart" in content_type or "x-www-form-urlencoded" in content_type:
            files = [f.name for f in request.FILES.values()]
            post_data = _redact_dict(dict(request.POST.items()))
            return {"form_fields": post_data, "uploaded_files": files}
            
        if not request.body:
            return None
            
        if "application/json" in content_type:
            try:
                data = json.loads(request.body.decode('utf-8'))
                return _redact_dict(data)
            except Exception:
                return request.body.decode('utf-8', errors='replace')[:1000]
        else:
            return request.body.decode('utf-8', errors='replace')[:1000]
    except Exception as e:
        return f"<Unable to parse body: {str(e)}>"

class RequestResponseLoggingMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request_id = str(uuid.uuid4())
        request.request_id = request_id  # Attach request ID to request object for downstream use
        
        start_time = time.time()
        
        # Capture request info early (body, method, path)
        method = request.method
        path = request.get_full_path()
        remote_ip = self._get_client_ip(request)
        request_body = _get_request_body(request)
        
        exception_info = None
        response = None
        
        try:
            response = self.get_response(request)
        except Exception as e:
            exception_info = {
                "message": str(e),
                "traceback": traceback.format_exc()
            }
            raise e
        finally:
            latency_ms = (time.time() - start_time) * 1000
            
            # Fetch user ID if authenticated
            user_id = None
            if hasattr(request, 'user') and request.user and request.user.is_authenticated:
                user_id = request.user.id
            
            status_code = response.status_code if response else 500
            
            # Capture response body if JSON (and small enough)
            response_body = None
            if response and "application/json" in (response.get('Content-Type') or ""):
                try:
                    if hasattr(response, 'content'):
                        resp_data = json.loads(response.content.decode('utf-8'))
                        response_body = _redact_dict(resp_data)
                except Exception:
                    pass
            
            log_data = {
                "timestamp": now().isoformat(),
                "request_id": request_id,
                "remote_ip": remote_ip,
                "user_id": user_id,
                "method": method,
                "path": path,
                "request_body": request_body,
                "status_code": status_code,
                "latency_ms": round(latency_ms, 2),
                "response_body": response_body,
                "exception": exception_info
            }
            
            # Determine appropriate log level
            log_json = json.dumps(log_data)
            if exception_info or status_code >= 500:
                logger.error(log_json)
            elif status_code >= 400:
                logger.warning(log_json)
            else:
                logger.info(log_json)
                
        return response

    def _get_client_ip(self, request):
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip = x_forwarded_for.split(',')[0].strip()
        else:
            ip = request.META.get('REMOTE_ADDR')
        return ip
