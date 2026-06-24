from django.urls import path
from api.views import LoanViewSet

loan_urls = [
    path('spaces/<int:space_id>/loans/', LoanViewSet.as_view({'get': 'list', 'post': 'create'}), name='loans'),
    path('spaces/<int:space_id>/loans/<int:pk>/', LoanViewSet.as_view({'get': 'retrieve', 'patch': 'partial_update'}), name='loan_detail'),
    path('spaces/<int:space_id>/loans/<int:pk>/activate/', LoanViewSet.as_view({'post': 'activate'}), name='loan_activate'),
    path('spaces/<int:space_id>/loans/<int:pk>/close/', LoanViewSet.as_view({'post': 'close'}), name='loan_close'),
    path('spaces/<int:space_id>/loans/<int:pk>/close-early/', LoanViewSet.as_view({'post': 'close_early'}), name='loan_close_early'),
    path('spaces/<int:space_id>/loans/<int:pk>/reopen/', LoanViewSet.as_view({'post': 'reopen'}), name='loan_reopen'),
    path('spaces/<int:space_id>/loans/<int:pk>/change-advance-mode/', LoanViewSet.as_view({'post': 'change_advance_mode'}), name='loan_change_advance_mode'),
    path('spaces/<int:space_id>/loans/<int:pk>/notes/', LoanViewSet.as_view({'post': 'notes'}), name='loan_notes'),
    path('spaces/<int:space_id>/loans/<int:pk>/schedule/', LoanViewSet.as_view({'get': 'schedule'}), name='loan_schedule'),
    path('spaces/<int:space_id>/loans/<int:pk>/schedule/custom-lines/', LoanViewSet.as_view({'post': 'custom_lines'}), name='loan_schedule_custom_lines'),
    path('spaces/<int:space_id>/loans/<int:pk>/disbursements/', LoanViewSet.as_view({'get': 'disbursements', 'post': 'disbursements'}), name='loan_disbursements'),
    
    # Restructuring nested under loan
    path('spaces/<int:space_id>/loans/<int:pk>/restructure/rate-change/', LoanViewSet.as_view({'post': 'restructure_rate_change'}), name='loan_restructure_rate_change'),
    path('spaces/<int:space_id>/loans/<int:pk>/restructure/extend-tenure/', LoanViewSet.as_view({'post': 'restructure_extend_tenure'}), name='loan_restructure_extend_tenure'),
    path('spaces/<int:space_id>/loans/<int:pk>/restructure/moratorium/', LoanViewSet.as_view({'post': 'restructure_moratorium'}), name='loan_restructure_moratorium'),
    path('spaces/<int:space_id>/loans/<int:pk>/restructure/waive-interest/', LoanViewSet.as_view({'post': 'waive_interest'}), name='loan_restructure_waive_interest'),
    path('spaces/<int:space_id>/loans/<int:pk>/restructure/waive-penalty/', LoanViewSet.as_view({'post': 'waive_penalty'}), name='loan_restructure_waive_penalty'),
    path('spaces/<int:space_id>/loans/<int:pk>/restructure/history/', LoanViewSet.as_view({'get': 'restructure_history'}), name='loan_restructure_history'),
    
    # Settle & write off nested under loan
    path('spaces/<int:space_id>/loans/<int:pk>/settle/', LoanViewSet.as_view({'post': 'settle'}), name='loan_settle'),
    path('spaces/<int:space_id>/loans/<int:pk>/write-off/', LoanViewSet.as_view({'post': 'write_off'}), name='loan_write_off'),
]

