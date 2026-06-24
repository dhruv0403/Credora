from django.urls import path
from api.views import (
    ReportReceivableView, ReportPayableView, ReportInterestView,
    ReportOverdueView, ReportCashFlowView, AnalyticsNetPositionView,
    AnalyticsTopContactsView, AnalyticsLoanRankingsView, AnalyticsTrendsView
)

report_urls = [
    # Reports
    path('spaces/<int:space_id>/reports/receivable/', ReportReceivableView.as_view(), name='report_receivable'),
    path('spaces/<int:space_id>/reports/payable/', ReportPayableView.as_view(), name='report_payable'),
    path('spaces/<int:space_id>/reports/interest/', ReportInterestView.as_view(), name='report_interest'),
    path('spaces/<int:space_id>/reports/overdue/', ReportOverdueView.as_view(), name='report_overdue'),
    path('spaces/<int:space_id>/reports/cash-flow/', ReportCashFlowView.as_view(), name='report_cash_flow'),

    # Analytics
    path('spaces/<int:space_id>/analytics/net-position/', AnalyticsNetPositionView.as_view(), name='analytics_net_position'),
    path('spaces/<int:space_id>/analytics/top-contacts/', AnalyticsTopContactsView.as_view(), name='analytics_top_contacts'),
    path('spaces/<int:space_id>/analytics/loan-rankings/', AnalyticsLoanRankingsView.as_view(), name='analytics_loan_rankings'),
    path('spaces/<int:space_id>/analytics/trends/', AnalyticsTrendsView.as_view(), name='analytics_trends'),
]

