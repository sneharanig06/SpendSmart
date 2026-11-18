from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect
from sqlalchemy.orm import Session
from pwdlib import PasswordHash
from datetime import datetime, timedelta, timezone
import jwt
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from schemas import (
    ExpenseCreate, ExpenseUpdate, ExpenseResponse,
    BudgetCreate, BudgetUpdate, BudgetResponse,
    DashboardResponse
)

from schemas import UserLogin, TokenResponse

from database import Base, engine, get_db
from models import User, Expense, Budget
from schemas import UserCreate, UserResponse

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="SpendSmart API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "null"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Password hashing
password_hash = PasswordHash.recommended()


@app.get("/")
def home():
    return {
        "message": "Welcome to SpendSmart!",
        "status": "Backend is running successfully"
    }


@app.get("/health")
def health_check():
    return {"status": "healthy"}


@app.get("/db-check")
def database_check():
    inspector = inspect(engine)
    return {
        "database": "connected",
        "tables": inspector.get_table_names()
    }


# User registration API
@app.post("/register", response_model=UserResponse)
def register_user(
    user: UserCreate,
    db: Session = Depends(get_db)
):
    # Check whether email already exists
    existing_user = db.query(User).filter(
        User.email == user.email
    ).first()

    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Email already registered"
        )

    # Hash the password
    hashed_password = password_hash.hash(user.password)

    # Create new user
    new_user = User(
        name=user.name,
        email=user.email,
        password_hash=hashed_password
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user
# JWT configuration
SECRET_KEY = "spendsmart-development-secret-change-before-deployment"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30


# Login API
@app.post("/login", response_model=TokenResponse)
def login_user(
    user: UserLogin,
    db: Session = Depends(get_db)
):
    # Find user by email
    db_user = db.query(User).filter(
        User.email == user.email
    ).first()

    # Verify email and password
    if not db_user or not password_hash.verify(
        user.password,
        db_user.password_hash
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    # Create JWT token
    expiration = datetime.now(timezone.utc) + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )

    token_data = {
        "sub": str(db_user.id),
        "exp": expiration
    }

    access_token = jwt.encode(
        token_data,
        SECRET_KEY,
        algorithm=ALGORITHM
    )

    return {
        "access_token": access_token,
        "token_type": "bearer"
    }
# JWT authentication
security = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    token = credentials.credentials

    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )

        user_id = int(payload["sub"])

    except (jwt.InvalidTokenError, KeyError, TypeError, ValueError):
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token"
        )

    current_user = db.query(User).filter(
        User.id == user_id
    ).first()

    if not current_user:
        raise HTTPException(
            status_code=401,
            detail="User not found"
        )

    return current_user
# 1. Add an expense
@app.post("/expenses", response_model=ExpenseResponse)
def add_expense(
    expense: ExpenseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    new_expense = Expense(
        user_id=current_user.id,
        category=expense.category,
        description=expense.description,
        amount=expense.amount,
        date=expense.date,
        payment_method=expense.payment_method
    )

    db.add(new_expense)
    db.commit()
    db.refresh(new_expense)

    return new_expense


# 2. View all expenses of logged-in user
@app.get("/expenses", response_model=list[ExpenseResponse])
def get_expenses(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return db.query(Expense).filter(
        Expense.user_id == current_user.id
    ).order_by(Expense.date.desc()).all()


# 3. Edit an expense
@app.put("/expenses/{expense_id}", response_model=ExpenseResponse)
def update_expense(
    expense_id: int,
    expense: ExpenseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    existing_expense = db.query(Expense).filter(
        Expense.id == expense_id,
        Expense.user_id == current_user.id
    ).first()

    if not existing_expense:
        raise HTTPException(
            status_code=404,
            detail="Expense not found"
        )

    update_data = expense.model_dump(exclude_unset=True)

    for key, value in update_data.items():
        setattr(existing_expense, key, value)

    db.commit()
    db.refresh(existing_expense)

    return existing_expense


# 4. Delete an expense
@app.delete("/expenses/{expense_id}")
def delete_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    existing_expense = db.query(Expense).filter(
        Expense.id == expense_id,
        Expense.user_id == current_user.id
    ).first()

    if not existing_expense:
        raise HTTPException(
            status_code=404,
            detail="Expense not found"
        )

    db.delete(existing_expense)
    db.commit()

    return {"message": "Expense deleted successfully"}
# CREATE OR UPDATE MONTHLY BUDGET
@app.post("/budgets", response_model=BudgetResponse)
def set_budget(
    budget: BudgetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    existing_budget = db.query(Budget).filter(
        Budget.user_id == current_user.id,
        Budget.month == budget.month,
        Budget.year == budget.year
    ).first()

    if existing_budget:
        existing_budget.amount = budget.amount
        db.commit()
        db.refresh(existing_budget)
        return existing_budget

    new_budget = Budget(
        user_id=current_user.id,
        month=budget.month,
        year=budget.year,
        amount=budget.amount
    )

    db.add(new_budget)
    db.commit()
    db.refresh(new_budget)

    return new_budget


# GET MONTHLY BUDGET
@app.get("/budgets", response_model=BudgetResponse)
def get_budget(
    month: int,
    year: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    budget = db.query(Budget).filter(
        Budget.user_id == current_user.id,
        Budget.month == month,
        Budget.year == year
    ).first()

    if not budget:
        raise HTTPException(status_code=404, detail="Budget not found")

    return budget


# UPDATE MONTHLY BUDGET
@app.put("/budgets/{budget_id}", response_model=BudgetResponse)
def update_budget(
    budget_id: int,
    budget: BudgetUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    existing_budget = db.query(Budget).filter(
        Budget.id == budget_id,
        Budget.user_id == current_user.id
    ).first()

    if not existing_budget:
        raise HTTPException(status_code=404, detail="Budget not found")

    existing_budget.amount = budget.amount

    db.commit()
    db.refresh(existing_budget)

    return existing_budget

from sqlalchemy import func, extract
@app.get("/dashboard", response_model=DashboardResponse)
def get_dashboard(
    month: int,
    year: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Get total expenses for the selected month
    total = db.query(func.sum(Expense.amount)).filter(
        Expense.user_id == current_user.id,
        extract("month", Expense.date) == month,
        extract("year", Expense.date) == year
    ).scalar() or 0

    # Get monthly budget
    budget = db.query(Budget).filter(
        Budget.user_id == current_user.id,
        Budget.month == month,
        Budget.year == year
    ).first()

    monthly_budget = budget.amount if budget else 0

    # Calculate remaining budget
    remaining = monthly_budget - total

    # Calculate budget usage percentage
    percentage = (
        (total / monthly_budget) * 100
        if monthly_budget > 0 else 0
    )

    # Get category-wise expenses
    category_data = db.query(
        Expense.category,
        func.sum(Expense.amount)
    ).filter(
        Expense.user_id == current_user.id,
        extract("month", Expense.date) == month,
        extract("year", Expense.date) == year
    ).group_by(Expense.category).all()

    category_wise_expenses = {
        category: float(amount)
        for category, amount in category_data
    }

    return {
        "month": month,
        "year": year,
        "total_expenses": float(total),
        "monthly_budget": float(monthly_budget),
        "remaining_budget": float(remaining),
        "budget_used_percentage": round(percentage, 2),
        "category_wise_expenses": category_wise_expenses
    }
