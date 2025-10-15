from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Form, Body
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import jwt
from passlib.context import CryptContext
import base64
import json
from fastapi.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Security
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
JWT_SECRET = os.environ.get('JWT_SECRET', 'cantina-projeto-deus-secret-key-2025')
JWT_ALGORITHM = "HS256"
security = HTTPBearer()

# Create the main app
app = FastAPI()
origins = [
    "https://cantina-pdd-project.vercel.app",
    "https://cantina-pdd-project-git-main-john-oliveiras-projects.vercel.app"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
 )

api_router = APIRouter(prefix="/api")

# Models
class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    role: str = "customer"  # customer, seller, admin
    credit: float = 0.0
    debt: float = 0.0
    notifications_enabled: bool = True
    theme_preference: str = "light"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class UserCreate(BaseModel):
    username: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    user: User

class Product(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    price: float
    stock: int
    low_stock_threshold: int = 10
    category: str = "general"
    image_url: str = ""
    volume_pricing: List[Dict[str, Any]] = []

class ProductCreate(BaseModel):
    name: str
    price: float
    stock: int
    low_stock_threshold: int = 10
    category: str = "general"
    image_url: str = ""
    volume_pricing: List[Dict[str, Any]] = []

class SaleItem(BaseModel):
    product_id: str
    name: str
    quantity: int
    unit_price: float

class Sale(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    seller_id: str
    customer_id: str
    items: List[SaleItem]
    total: float
    payment_method: str
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    status: str = "completed"  # completed, cancelled
    cancellation_reason: Optional[str] = None

class SaleCreate(BaseModel):
    customer_id: str
    items: List[SaleItem]
    total: float
    payment_method: str

class SaleCancellation(BaseModel):
    reason: str

class Transaction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    type: str  # credit_add, debt_payment
    amount: float
    status: str = "pending"  # pending, approved, rejected
    receipt_url: str = ""
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    admin_note: Optional[str] = None

class TransactionCreate(BaseModel):
    type: str
    amount: float
    receipt_data: str  # base64 image data

class TransactionReview(BaseModel):
    status: str
    admin_note: Optional[str] = None

class CashDrawer(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    seller_id: str
    opening_balance: float
    closing_balance: Optional[float] = None
    sales_ids: List[str] = []
    timestamp_opened: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    timestamp_closed: Optional[str] = None

class CashDrawerCreate(BaseModel):
    opening_balance: float

class PushSubscription(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    subscription_data: Dict[str, Any]
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class PushSubscriptionCreate(BaseModel):
    subscription_data: Dict[str, Any]

class PushNotificationSend(BaseModel):
    message: str
    target_type: str  # all_users, role, debtors, manual
    target_role: Optional[str] = None  # customers, sellers
    target_user_ids: Optional[List[str]] = None

# Auth helpers
def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=30)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> User:
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        user_doc = await db.users.find_one({"id": user_id}, {"_id": 0})
        if not user_doc:
            raise HTTPException(status_code=401, detail="User not found")
        
        return User(**user_doc)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid token")

async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

async def require_seller(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in ["seller", "admin"]:
        raise HTTPException(status_code=403, detail="Seller access required")
    return current_user

# Auth endpoints
@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    # Check if username exists
    existing = await db.users.find_one({"username": user_data.username})
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    # Create user
    user = User(username=user_data.username)
    user_doc = user.model_dump()
    user_doc["password_hash"] = hash_password(user_data.password)
    
    await db.users.insert_one(user_doc)
    
    # Create token
    token = create_access_token({"user_id": user.id})
    
    return TokenResponse(access_token=token, user=user)

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(user_data: UserLogin):
    # Find user
    user_doc = await db.users.find_one({"username": user_data.username})
    if not user_doc:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Verify password
    if not verify_password(user_data.password, user_doc["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Create user object
    user = User(**{k: v for k, v in user_doc.items() if k != "password_hash" and k != "_id"})
    
    # Create token
    token = create_access_token({"user_id": user.id})
    
    return TokenResponse(access_token=token, user=user)

@api_router.get("/auth/me", response_model=User)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user

# User endpoints
@api_router.get("/users", response_model=List[User])
async def get_users(current_user: User = Depends(get_current_user)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return [User(**u) for u in users]

@api_router.get("/users/{user_id}", response_model=User)
async def get_user(user_id: str, current_user: User = Depends(get_current_user)):
    user_doc = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    return User(**user_doc)

@api_router.patch("/users/{user_id}/role")
async def update_user_role(user_id: str, role: str = Body(..., embed=True), current_user: User = Depends(require_admin)):
    if role not in ["customer", "seller"]:
        raise HTTPException(status_code=400, detail="Invalid role")
    
    result = await db.users.update_one({"id": user_id}, {"$set": {"role": role}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"success": True}

@api_router.patch("/users/{user_id}/theme")
async def update_theme(user_id: str, theme: str = Body(..., embed=True), current_user: User = Depends(get_current_user)):
    if current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Can only update own theme")
    
    result = await db.users.update_one({"id": user_id}, {"$set": {"theme_preference": theme}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"success": True}

@api_router.patch("/users/{user_id}/notifications")
async def update_notifications(user_id: str, enabled: bool = Body(..., embed=True), current_user: User = Depends(get_current_user)):
    if current_user.id != user_id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    result = await db.users.update_one({"id": user_id}, {"$set": {"notifications_enabled": enabled}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"success": True}

# Product endpoints
@api_router.get("/products", response_model=List[Product])
async def get_products():
    products = await db.products.find({}, {"_id": 0}).to_list(1000)
    return [Product(**p) for p in products]

@api_router.post("/products", response_model=Product)
async def create_product(product_data: ProductCreate, current_user: User = Depends(require_admin)):
    product = Product(**product_data.model_dump())
    await db.products.insert_one(product.model_dump())
    return product

@api_router.put("/products/{product_id}", response_model=Product)
async def update_product(product_id: str, product_data: ProductCreate, current_user: User = Depends(require_admin)):
    product = Product(id=product_id, **product_data.model_dump())
    result = await db.products.replace_one({"id": product_id}, product.model_dump())
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return product

@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str, current_user: User = Depends(require_admin)):
    result = await db.products.delete_one({"id": product_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"success": True}

@api_router.post("/products/{product_id}/upload-image")
async def upload_product_image(product_id: str, image_data: str = Body(..., embed=True), current_user: User = Depends(require_admin)):
    # Store image as base64 data URL
    result = await db.products.update_one({"id": product_id}, {"$set": {"image_url": image_data}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"success": True}

# Sale endpoints
@api_router.post("/sales", response_model=Sale)
async def create_sale(sale_data: SaleCreate, current_user: User = Depends(require_seller)):
    sale = Sale(
        seller_id=current_user.id,
        customer_id=sale_data.customer_id,
        items=sale_data.items,
        total=sale_data.total,
        payment_method=sale_data.payment_method
    )
    
    # Update product stock
    for item in sale.items:
        await db.products.update_one(
            {"id": item.product_id},
            {"$inc": {"stock": -item.quantity}}
        )
    
    # Update customer balance
    if sale_data.payment_method == "fiado":
        await db.users.update_one(
            {"id": sale_data.customer_id},
            {"$inc": {"debt": sale_data.total}}
        )
    elif sale_data.payment_method == "credit":
        await db.users.update_one(
            {"id": sale_data.customer_id},
            {"$inc": {"credit": -sale_data.total}}
        )
    
    await db.sales.insert_one(sale.model_dump())
    return sale

@api_router.get("/sales", response_model=List[Sale])
async def get_sales(current_user: User = Depends(get_current_user)):
    if current_user.role == "admin":
        sales = await db.sales.find({}, {"_id": 0}).to_list(1000)
    else:
        sales = await db.sales.find({"customer_id": current_user.id}, {"_id": 0}).to_list(1000)
    return [Sale(**s) for s in sales]

@api_router.post("/sales/{sale_id}/cancel")
async def cancel_sale(sale_id: str, cancellation: SaleCancellation, current_user: User = Depends(require_seller)):
    sale_doc = await db.sales.find_one({"id": sale_id})
    if not sale_doc:
        raise HTTPException(status_code=404, detail="Sale not found")
    
    if sale_doc["status"] == "cancelled":
        raise HTTPException(status_code=400, detail="Sale already cancelled")
    
    # Restore product stock
    for item in sale_doc["items"]:
        await db.products.update_one(
            {"id": item["product_id"]},
            {"$inc": {"stock": item["quantity"]}}
        )
    
    # Restore customer balance
    if sale_doc["payment_method"] == "fiado":
        await db.users.update_one(
            {"id": sale_doc["customer_id"]},
            {"$inc": {"debt": -sale_doc["total"]}}
        )
    elif sale_doc["payment_method"] == "credit":
        await db.users.update_one(
            {"id": sale_doc["customer_id"]},
            {"$inc": {"credit": sale_doc["total"]}}
        )
    
    # Update sale status
    await db.sales.update_one(
        {"id": sale_id},
        {"$set": {"status": "cancelled", "cancellation_reason": cancellation.reason}}
    )
    
    return {"success": True}

# Transaction endpoints
@api_router.post("/transactions", response_model=Transaction)
async def create_transaction(transaction_data: TransactionCreate, current_user: User = Depends(get_current_user)):
    transaction = Transaction(
        user_id=current_user.id,
        type=transaction_data.type,
        amount=transaction_data.amount,
        receipt_url=transaction_data.receipt_data
    )
    await db.transactions.insert_one(transaction.model_dump())
    return transaction

@api_router.get("/transactions", response_model=List[Transaction])
async def get_transactions(current_user: User = Depends(get_current_user)):
    if current_user.role == "admin":
        transactions = await db.transactions.find({}, {"_id": 0}).to_list(1000)
    else:
        transactions = await db.transactions.find({"user_id": current_user.id}, {"_id": 0}).to_list(1000)
    return [Transaction(**t) for t in transactions]

@api_router.patch("/transactions/{transaction_id}/review")
async def review_transaction(transaction_id: str, review: TransactionReview, current_user: User = Depends(require_admin)):
    transaction_doc = await db.transactions.find_one({"id": transaction_id})
    if not transaction_doc:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # Update transaction status
    await db.transactions.update_one(
        {"id": transaction_id},
        {"$set": {"status": review.status, "admin_note": review.admin_note}}
    )
    
    # Update user balance if approved
    if review.status == "approved":
        if transaction_doc["type"] == "credit_add":
            await db.users.update_one(
                {"id": transaction_doc["user_id"]},
                {"$inc": {"credit": transaction_doc["amount"]}}
            )
        elif transaction_doc["type"] == "debt_payment":
            await db.users.update_one(
                {"id": transaction_doc["user_id"]},
                {"$inc": {"debt": -transaction_doc["amount"]}}
            )
    
    return {"success": True}

# Cash drawer endpoints
@api_router.post("/cash-drawer", response_model=CashDrawer)
async def open_cash_drawer(drawer_data: CashDrawerCreate, current_user: User = Depends(require_seller)):
    # Check if there's an open drawer
    open_drawer = await db.cash_drawers.find_one({"seller_id": current_user.id, "timestamp_closed": None})
    if open_drawer:
        raise HTTPException(status_code=400, detail="Cash drawer already open")
    
    drawer = CashDrawer(seller_id=current_user.id, opening_balance=drawer_data.opening_balance)
    await db.cash_drawers.insert_one(drawer.model_dump())
    return drawer

@api_router.get("/cash-drawer/current", response_model=CashDrawer)
async def get_current_drawer(current_user: User = Depends(require_seller)):
    drawer_doc = await db.cash_drawers.find_one(
        {"seller_id": current_user.id, "timestamp_closed": None},
        {"_id": 0}
    )
    if not drawer_doc:
        raise HTTPException(status_code=404, detail="No open cash drawer")
    return CashDrawer(**drawer_doc)

@api_router.post("/cash-drawer/{drawer_id}/close")
async def close_cash_drawer(drawer_id: str, closing_balance: float = Body(..., embed=True), current_user: User = Depends(require_seller)):
    drawer_doc = await db.cash_drawers.find_one({"id": drawer_id})
    if not drawer_doc:
        raise HTTPException(status_code=404, detail="Cash drawer not found")
    
    if drawer_doc["seller_id"] != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    await db.cash_drawers.update_one(
        {"id": drawer_id},
        {"$set": {
            "closing_balance": closing_balance,
            "timestamp_closed": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"success": True}

@api_router.post("/cash-drawer/{drawer_id}/add-sale")
async def add_sale_to_drawer(drawer_id: str, sale_id: str = Body(..., embed=True), current_user: User = Depends(require_seller)):
    await db.cash_drawers.update_one(
        {"id": drawer_id},
        {"$push": {"sales_ids": sale_id}}
    )
    return {"success": True}

@api_router.get("/cash-drawer/history", response_model=List[CashDrawer])
async def get_drawer_history(current_user: User = Depends(require_admin)):
    drawers = await db.cash_drawers.find({}, {"_id": 0}).to_list(1000)
    return [CashDrawer(**d) for d in drawers]

# Push notification endpoints
@api_router.post("/push/subscribe")
async def subscribe_push(subscription_data: PushSubscriptionCreate, current_user: User = Depends(get_current_user)):
    # Check if subscription exists
    existing = await db.push_subscriptions.find_one({"user_id": current_user.id})
    if existing:
        # Update existing subscription
        await db.push_subscriptions.update_one(
            {"user_id": current_user.id},
            {"$set": {"subscription_data": subscription_data.subscription_data}}
        )
    else:
        # Create new subscription
        subscription = PushSubscription(
            user_id=current_user.id,
            subscription_data=subscription_data.subscription_data
        )
        await db.push_subscriptions.insert_one(subscription.model_dump())
    
    return {"success": True}

@api_router.post("/push/send")
async def send_push_notification(notification: PushNotificationSend, current_user: User = Depends(require_admin)):
    # Get target users based on criteria
    target_user_ids = []
    
    if notification.target_type == "all_users":
        users = await db.users.find({"notifications_enabled": True}, {"id": 1}).to_list(1000)
        target_user_ids = [u["id"] for u in users]
    elif notification.target_type == "role":
        users = await db.users.find(
            {"role": notification.target_role, "notifications_enabled": True},
            {"id": 1}
        ).to_list(1000)
        target_user_ids = [u["id"] for u in users]
    elif notification.target_type == "debtors":
        users = await db.users.find(
            {"debt": {"$gt": 0}, "notifications_enabled": True},
            {"id": 1}
        ).to_list(1000)
        target_user_ids = [u["id"] for u in users]
    elif notification.target_type == "manual":
        target_user_ids = notification.target_user_ids or []
    
    # Get subscriptions for target users
    subscriptions = await db.push_subscriptions.find(
        {"user_id": {"$in": target_user_ids}},
        {"_id": 0}
    ).to_list(1000)
    
    # In a real implementation, you would use a service like Firebase Cloud Messaging
    # or Web Push to send notifications. For this MVP, we'll just return success.
    # Store notification history
    notification_record = {
        "id": str(uuid.uuid4()),
        "message": notification.message,
        "target_type": notification.target_type,
        "target_count": len(target_user_ids),
        "sent_by": current_user.id,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    await db.notifications.insert_one(notification_record)
    
    return {"success": True, "recipients": len(subscriptions)}

# Statistics endpoints
@api_router.get("/stats/low-stock")
async def get_low_stock(current_user: User = Depends(require_admin)):
    products = await db.products.find({}, {"_id": 0}).to_list(1000)
    low_stock = [p for p in products if p["stock"] <= p["low_stock_threshold"]]
    return low_stock

@api_router.get("/stats/pending-transactions")
async def get_pending_transactions(current_user: User = Depends(require_admin)):
    count = await db.transactions.count_documents({"status": "pending"})
    return {"count": count}

# Include the router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("startup")
async def startup_db():
    # Create default admin user
    admin_exists = await db.users.find_one({"username": "admin"})
    if not admin_exists:
        admin = User(username="admin", role="admin")
        admin_doc = admin.model_dump()
        admin_doc["password_hash"] = hash_password("projeto2025")
        await db.users.insert_one(admin_doc)
        logger.info("Default admin user created")
    
    # Create sample products
    product_count = await db.products.count_documents({})
    if product_count == 0:
        sample_products = [
            {"name": "Refrigerante Lata", "price": 4.50, "stock": 50, "category": "Bebidas", "image_url": "https://images.unsplash.com/photo-1625865019845-7b2c89b8a8a9?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDk1Nzl8MHwxfHNlYXJjaHwxfHxiZXZlcmFnZXN8ZW58MHx8fHwxNzYwMjkyMjAwfDA&ixlib=rb-4.1.0&q=85"},
            {"name": "Água Mineral", "price": 2.50, "stock": 100, "category": "Bebidas", "image_url": "https://images.unsplash.com/photo-1523677011781-c91d1bbe2f9e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDk1Nzl8MHwxfHNlYXJjaHwyfHxiZXZlcmFnZXN8ZW58MHx8fHwxNzYwMjkyMjAwfDA&ixlib=rb-4.1.0&q=85"},
            {"name": "Café", "price": 3.00, "stock": 30, "category": "Bebidas", "image_url": "https://images.pexels.com/photos/3020919/pexels-photo-3020919.jpeg"},
            {"name": "Suco Natural", "price": 5.50, "stock": 25, "category": "Bebidas", "image_url": "https://images.pexels.com/photos/3028500/pexels-photo-3028500.jpeg"},
            {"name": "Salgadinho", "price": 3.50, "stock": 60, "category": "Salgados", "image_url": "https://images.unsplash.com/photo-1688217170693-e821c6e18d72?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzB8MHwxfHNlYXJjaHwzfHxzbmFja3N8ZW58MHx8fHwxNzYwMjkyMTk1fDA&ixlib=rb-4.1.0&q=85"},
            {"name": "Chocolate", "price": 4.00, "stock": 40, "category": "Doces", "image_url": "https://images.unsplash.com/photo-1621939514649-280e2ee25f60?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzB8MHwxfHNlYXJjaHwxfHxzbmFja3N8ZW58MHx8fHwxNzYwMjkyMTk1fDA&ixlib=rb-4.1.0&q=85"},
            {"name": "Biscoitos", "price": 2.00, "stock": 70, "category": "Doces", "image_url": "https://images.unsplash.com/photo-1614735241165-6756e1df61ab?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzB8MHwxfHNlYXJjaHwyfHxzbmFja3N8ZW58MHx8fHwxNzYwMjkyMTk1fDA&ixlib=rb-4.1.0&q=85"},
            {"name": "Bolo Fatia", "price": 6.00, "stock": 20, "category": "Doces", "image_url": "https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg"},
            {"name": "Sanduíche", "price": 8.00, "stock": 15, "category": "Refeições", "image_url": "https://images.unsplash.com/photo-1482049016688-2d3e1b311543?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzV8MHwxfHNlYXJjaHwxfHxmb29kfGVufDB8fHx8MTc2MDI5MjIwNXww&ixlib=rb-4.1.0&q=85"},
            {"name": "Salada", "price": 10.00, "stock": 12, "category": "Refeições", "image_url": "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzV8MHwxfHNlYXJjaHwyfHxmb29kfGVufDB8fHx8MTc2MDI5MjIwNXww&ixlib=rb-4.1.0&q=85"},
            {"name": "Pizza Fatia", "price": 7.50, "stock": 18, "category": "Refeições", "image_url": "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzV8MHwxfHNlYXJjaHwzfHxmb29kfGVufDB8fHx8MTc2MDI5MjIwNXww&ixlib=rb-4.1.0&q=85"},
            {"name": "Pacote de Chips", "price": 5.00, "stock": 35, "category": "Salgados", "image_url": "https://images.pexels.com/photos/2122278/pexels-photo-2122278.jpeg"},
        ]
        
        for p in sample_products:
            product = Product(**p)
            await db.products.insert_one(product.model_dump())
        
        logger.info("Sample products created")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
