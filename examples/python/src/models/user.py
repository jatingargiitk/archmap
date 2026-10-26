from datetime import datetime
from ..utils import format_date

class User:
    def __init__(self, user_id: str, name: str):
        self.id = user_id
        self.name = name
        self.created_at = datetime.now()
    
    def format_created_at(self) -> str:
        return format_date(self.created_at)
