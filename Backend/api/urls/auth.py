from django.urls import path
from api.views import RegisterView, MeUserView, ChangePasswordView
from rest_framework_simplejwt.views import (
    TokenObtainPairView, TokenRefreshView, TokenBlacklistView
)

auth_urls = [
    path('auth/register/', RegisterView.as_view(), name='register'),
    path('auth/login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('auth/logout/', TokenBlacklistView.as_view(), name='token_blacklist'),
    
    path('users/me/', MeUserView.as_view(), name='user_me'),
    path('users/me/change-password/', ChangePasswordView.as_view(), name='user_change_password'),
]

