from django.urls import path
from api.views import TransactionViewSet

transaction_urls = [
    path('spaces/<int:space_id>/transactions/', TransactionViewSet.as_view({'get': 'list', 'post': 'create'}), name='transactions'),
    path('spaces/<int:space_id>/loans/<int:loan_id>/transactions/', TransactionViewSet.as_view({'get': 'list'}), name='loan_transactions'),
    path('spaces/<int:space_id>/transactions/<int:pk>/', TransactionViewSet.as_view({'get': 'retrieve'}), name='transaction_detail'),
    path('spaces/<int:space_id>/transactions/<int:pk>/reverse/', TransactionViewSet.as_view({'post': 'reverse'}), name='transaction_reverse'),
]

