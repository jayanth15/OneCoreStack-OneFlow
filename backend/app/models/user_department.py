from sqlmodel import Field, SQLModel


class UserDepartment(SQLModel, table=True):
    """Many-to-many link between User and Department."""
    __tablename__ = "user_departments"

    user_id: int = Field(foreign_key="users.id", primary_key=True)
    department_id: int = Field(foreign_key="departments.id", primary_key=True)
