from django.db import models
from django.conf import settings

class SpaceType(models.TextChoices):
    PERSONAL = 'PERSONAL', 'Personal'
    BUSINESS = 'BUSINESS', 'Business'

class SpaceVisibility(models.TextChoices):
    PRIVATE = 'PRIVATE', 'Private'
    SHARED = 'SHARED', 'Shared'

class MemberRole(models.TextChoices):
    OWNER = 'OWNER', 'Owner'
    ADMIN = 'ADMIN', 'Admin'
    VIEWER = 'VIEWER', 'Viewer'
    FIELDMAN = 'FIELDMAN', 'FieldMan'

class MemberStatus(models.TextChoices):
    PENDING = 'PENDING', 'Pending'
    ACTIVE = 'ACTIVE', 'Active'
    REMOVED = 'REMOVED', 'Removed'


class Space(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='owned_spaces')
    name = models.CharField(max_length=120)
    space_type = models.CharField(
        max_length=20,
        choices=SpaceType.choices,
        default=SpaceType.PERSONAL
    )
    space_visibility = models.CharField(
        max_length=20,
        choices=SpaceVisibility.choices,
        default=SpaceVisibility.PRIVATE
    )
    currency_code = models.CharField(max_length=3, default='INR')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'spaces'
        app_label = 'api'
        indexes = [
            models.Index(fields=['owner']),
        ]

    def __str__(self):
        return self.name


class SpaceMember(models.Model):
    space = models.ForeignKey(Space, on_delete=models.CASCADE, related_name='members')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE, related_name='memberships')
    invited_email = models.EmailField(max_length=255, null=True, blank=True)
    role = models.CharField(max_length=20, choices=MemberRole.choices)
    status = models.CharField(
        max_length=20,
        choices=MemberStatus.choices,
        default=MemberStatus.ACTIVE
    )
    invited_by = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='invited_members'
    )
    joined_at = models.DateTimeField(null=True, blank=True)
    removed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'space_members'
        app_label = 'api'
        indexes = [
            models.Index(fields=['space']),
            models.Index(fields=['user']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['space', 'user'],
                condition=models.Q(user__isnull=False) & ~models.Q(status=MemberStatus.REMOVED),
                name='unique_active_space_user'
            )
        ]

    def __str__(self):
        return f"{self.user or self.invited_email} in {self.space.name} ({self.role})"


class SpaceInvite(models.Model):
    space_member = models.ForeignKey(SpaceMember, on_delete=models.CASCADE, related_name='invites')
    token = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    accepted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'space_invites'
        app_label = 'api'


class SpaceSettings(models.Model):
    # We reference spaces.Space as Space settings is OneToOne
    space = models.OneToOneField(Space, on_delete=models.CASCADE, primary_key=True, related_name='settings')
    # Since interest_type/repayment_type are defined in loans.py, we can refer to choices by string or load lazily, 
    # but to keep it simple, we can load them or define choices string representation directly:
    default_interest_type = models.CharField(
        max_length=20,
        default='NONE'
    )
    default_rate_value = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True)
    default_rate_period = models.CharField(
        max_length=10,
        null=True,
        blank=True
    )
    default_repayment_type = models.CharField(
        max_length=20,
        default='EMI'
    )
    default_payment_frequency = models.CharField(
        max_length=20,
        null=True,
        blank=True
    )
    default_advance_payment_mode = models.CharField(
        max_length=30,
        default='CARRY_FORWARD_CREDIT'
    )
    default_penalty_type = models.CharField(
        max_length=20,
        default='NONE'
    )
    default_grace_period_days = models.PositiveSmallIntegerField(default=0)
    deduct_expenses_from_reports = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'space_settings'
        app_label = 'api'
