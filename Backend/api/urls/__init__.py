from .auth import auth_urls
from .spaces import space_urls
from .contacts import contact_urls
from .loans import loan_urls
from .transactions import transaction_urls
from .expenses import expense_urls
from .partners import partner_urls
from .documents import document_urls
from .activity import activity_urls
from .reports import report_urls

urlpatterns = (
    auth_urls +
    space_urls +
    contact_urls +
    loan_urls +
    transaction_urls +
    expense_urls +
    partner_urls +
    document_urls +
    activity_urls +
    report_urls
)
