from django.urls import path
from api.views import SpacePartnerViewSet

partner_urls = [
    path('spaces/<int:space_id>/partners/', SpacePartnerViewSet.as_view({'get': 'list', 'post': 'create'}), name='space_partners'),
    path('spaces/<int:space_id>/partners/dashboard/', SpacePartnerViewSet.as_view({'get': 'dashboard'}), name='space_partners_dashboard'),
    path('spaces/<int:space_id>/partners/<int:pk>/', SpacePartnerViewSet.as_view({'patch': 'partial_update', 'delete': 'destroy'}), name='space_partner_detail'),
    path('spaces/<int:space_id>/partners/<int:pk>/capital-transactions/', SpacePartnerViewSet.as_view({'get': 'capital_transactions', 'post': 'capital_transactions'}), name='space_partner_capital'),
]

