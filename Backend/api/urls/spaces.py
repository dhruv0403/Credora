from django.urls import path, include
from rest_framework.routers import DefaultRouter
from api.views import SpaceViewSet, SpaceMemberViewSet, AcceptInviteView, SpaceSettingsView

router = DefaultRouter()
router.register(r'spaces', SpaceViewSet, basename='space')

space_urls = [
    # Invites acceptance
    path('invites/<str:token>/accept/', AcceptInviteView.as_view(), name='accept_invite'),
    
    # Nested Space endpoints:
    # 1. Space actions
    path('spaces/<int:space_id>/change-type/', SpaceViewSet.as_view({'post': 'change_type'}), name='space_change_type'),
    path('spaces/<int:space_id>/change-visibility/', SpaceViewSet.as_view({'post': 'change_visibility'}), name='space_change_visibility'),
    path('spaces/<int:space_id>/transfer-ownership/', SpaceViewSet.as_view({'post': 'transfer_ownership'}), name='space_transfer_ownership'),
    path('spaces/<int:space_id>/dashboard/', SpaceViewSet.as_view({'get': 'dashboard'}), name='space_dashboard'),
    
    # 2. Space settings
    path('spaces/<int:space_id>/settings/', SpaceSettingsView.as_view(), name='space_settings'),
    
    # 3. Space members
    path('spaces/<int:space_id>/members/', SpaceMemberViewSet.as_view({'get': 'list'}), name='space_members_list'),
    path('spaces/<int:space_id>/members/invite/', SpaceMemberViewSet.as_view({'post': 'invite'}), name='space_members_invite'),
    path('spaces/<int:space_id>/members/<int:pk>/', SpaceMemberViewSet.as_view({'patch': 'partial_update', 'delete': 'destroy'}), name='space_member_detail'),
    path('spaces/<int:space_id>/members/<int:pk>/resend-invite/', SpaceMemberViewSet.as_view({'post': 'resend_invite'}), name='space_member_resend_invite'),
    
    path('', include(router.urls)),
]

