from ..models import User
from ..utils import capitalize

def get_user(user_id: str) -> dict:
    user = User(user_id, 'john doe')
    return {
        'id': user.id,
        'name': capitalize(user.name),
        'created_at': user.format_created_at()
    }
