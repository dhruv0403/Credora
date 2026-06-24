from rest_framework import serializers
from api.models import Space, SpaceSettings, SpaceMember, MemberStatus

class SpaceSerializer(serializers.ModelSerializer):
    owner_display_name = serializers.CharField(source='owner.display_name', read_only=True)
    role_in_space = serializers.SerializerMethodField()

    class Meta:
        model = Space
        fields = [
            'id', 'owner', 'owner_display_name', 'name', 'space_type',
            'space_visibility', 'currency_code', 'role_in_space',
            'created_at', 'updated_at', 'deleted_at'
        ]
        read_only_fields = ['id', 'owner', 'created_at', 'updated_at', 'deleted_at']

    def get_role_in_space(self, obj):
        request = self.context.get('request')
        if not request or not request.user or not request.user.is_authenticated:
            return None
        try:
            member = SpaceMember.objects.get(space=obj, user=request.user, status=MemberStatus.ACTIVE)
            return member.role
        except SpaceMember.DoesNotExist:
            return None


class SpaceSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = SpaceSettings
        fields = '__all__'
        read_only_fields = ['space']

