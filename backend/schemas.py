from __future__ import annotations
from pydantic import BaseModel, Field


class UserCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: str
    password: str = Field(min_length=8)


class UserResponse(BaseModel):
    id: int
    name: str
    email: str

class Config:
    from_attributes = True

class UserLogin(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
from datetime import date as DateType
from pydantic import BaseModel, Field


class ExpenseCreate(BaseModel):
    category: str = Field(min_length=2, max_length=50)
    description: str | None = None
    amount: float = Field(gt=0)
    date: DateType
    payment_method: str | None = None


class ExpenseUpdate(BaseModel):
    category: str | None = Field(default=None, min_length=2, max_length=50)
    description: str | None = None
    amount: float | None = Field(default=None, gt=0)
    date: DateType | None = None
    payment_method: str | None = None


class ExpenseResponse(BaseModel):
    id: int
    user_id: int
    category: str
    description: str | None
    amount: float
    date: DateType
    payment_method: str | None

class Config:
    from_attributes = True

class BudgetCreate(BaseModel):
    month: int = Field(ge=1, le=12)
    year: int = Field(ge=2024, le=2100)
    amount: float = Field(gt=0)


class BudgetUpdate(BaseModel):
    amount: float = Field(gt=0)


class BudgetResponse(BaseModel):
    id: int
    user_id: int
    month: int
    year: int
    amount: float

    class Config:
        from_attributes = True

class DashboardResponse(BaseModel):
    month: int
    year: int
    total_expenses: float
    monthly_budget: float
    remaining_budget: float
    budget_used_percentage: float
    category_wise_expenses: dict[str, float]