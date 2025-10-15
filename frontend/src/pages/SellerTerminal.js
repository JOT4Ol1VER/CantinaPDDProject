import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useTheme } from '@/App';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { 
  ArrowLeft, Search, ShoppingCart, Trash2, CreditCard, 
  Banknote, Wallet, DollarSign, X, Check, Sun, Moon 
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function SellerTerminal() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [cashDrawer, setCashDrawer] = useState(null);
  const [openingBalance, setOpeningBalance] = useState('');
  const [cashAmount, setCashAmount] = useState('');
  const [showPayment, setShowPayment] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelSaleId, setCancelSaleId] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [recentSales, setRecentSales] = useState([]);

  useEffect(() => {
    fetchProducts();
    fetchCustomers();
    fetchCashDrawer();
    fetchRecentSales();
  }, []);

  const fetchProducts = async () => {
    try {
      const response = await axios.get(`${API}/products`);
      setProducts(response.data);
    } catch (error) {
      console.error('Failed to fetch products:', error);
    }
  };

  const fetchCustomers = async () => {
    try {
      const response = await axios.get(`${API}/users`);
      setCustomers(response.data);
    } catch (error) {
      console.error('Failed to fetch customers:', error);
    }
  };

  const fetchCashDrawer = async () => {
    try {
      const response = await axios.get(`${API}/cash-drawer/current`);
      setCashDrawer(response.data);
    } catch (error) {
      // No open drawer
    }
  };

  const fetchRecentSales = async () => {
    try {
      const response = await axios.get(`${API}/sales`);
      setRecentSales(response.data.slice(0, 10));
    } catch (error) {
      console.error('Failed to fetch sales:', error);
    }
  };

  const openCashDrawer = async () => {
    if (!openingBalance) {
      toast.error('Digite o saldo inicial');
      return;
    }

    try {
      const response = await axios.post(`${API}/cash-drawer`, {
        opening_balance: parseFloat(openingBalance)
      });
      setCashDrawer(response.data);
      toast.success('Caixa aberto!');
    } catch (error) {
      toast.error('Erro ao abrir caixa');
    }
  };

  const addToCart = (product) => {
    const existingItem = cart.find(item => item.id === product.id);
    if (existingItem) {
      setCart(cart.map(item =>
        item.id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setCart([...cart, { ...product, quantity: 1 }]);
    }
  };

  const removeFromCart = (productId) => {
    setCart(cart.filter(item => item.id !== productId));
  };

  const updateQuantity = (productId, newQuantity) => {
    if (newQuantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart(cart.map(item =>
      item.id === productId ? { ...item, quantity: newQuantity } : item
    ));
  };

  const calculateTotal = () => {
    return cart.reduce((total, item) => total + (item.price * item.quantity), 0);
  };

  const calculateChange = () => {
    if (!cashAmount) return 0;
    return parseFloat(cashAmount) - calculateTotal();
  };

  const processSale = async (paymentMethod) => {
    if (!selectedCustomer) {
      toast.error('Selecione um cliente');
      return;
    }

    if (cart.length === 0) {
      toast.error('Adicione produtos ao carrinho');
      return;
    }

    // Check Fiado limit
    if (paymentMethod === 'fiado' && selectedCustomer.debt >= 10) {
      toast.error('Cliente atingiu o limite de fiado (R$ 10,00)');
      return;
    }

    // Check credit balance
    if (paymentMethod === 'credit' && selectedCustomer.credit < calculateTotal()) {
      toast.error('Crédito insuficiente');
      return;
    }

    try {
      const saleData = {
        customer_id: selectedCustomer.id,
        items: cart.map(item => ({
          product_id: item.id,
          name: item.name,
          quantity: item.quantity,
          unit_price: item.price
        })),
        total: calculateTotal(),
        payment_method: paymentMethod
      };

      const response = await axios.post(`${API}/sales`, saleData);

      // Add sale to cash drawer if payment is cash
      if (cashDrawer && paymentMethod === 'cash') {
        await axios.post(`${API}/cash-drawer/${cashDrawer.id}/add-sale`, {
          sale_id: response.data.id
        });
      }

      toast.success('Venda realizada com sucesso!');
      setCart([]);
      setCashAmount('');
      setShowPayment(false);
      fetchProducts();
      fetchCustomers();
      fetchRecentSales();
    } catch (error) {
      toast.error('Erro ao processar venda');
    }
  };

  const cancelSale = async () => {
    if (!cancelReason.trim()) {
      toast.error('Digite o motivo do cancelamento');
      return;
    }

    try {
      await axios.post(`${API}/sales/${cancelSaleId}/cancel`, {
        reason: cancelReason
      });
      toast.success('Venda cancelada');
      setShowCancel(false);
      setCancelReason('');
      fetchRecentSales();
      fetchProducts();
      fetchCustomers();
    } catch (error) {
      toast.error('Erro ao cancelar venda');
    }
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!cashDrawer) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Abrir Caixa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="opening-balance">Saldo Inicial (R$)</Label>
              <Input
                id="opening-balance"
                data-testid="opening-balance-input"
                type="number"
                step="0.01"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <Button onClick={openCashDrawer} className="w-full" data-testid="open-drawer-button">
              Abrir Caixa
            </Button>
            <Button variant="outline" onClick={() => navigate('/portal')} className="w-full">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/portal')}
                data-testid="back-button"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold text-emerald-700 dark:text-emerald-400">
                  Terminal de Vendas
                </h1>
                <p className="text-sm text-muted-foreground">Vendedor: {user?.username}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={toggleTheme} data-testid="theme-toggle">
              {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Products Section */}
          <div className="lg:col-span-2 space-y-4">
            {/* Customer Selection */}
            <Card>
              <CardHeader>
                <CardTitle>Selecionar Cliente</CardTitle>
              </CardHeader>
              <CardContent>
                <Select
                  value={selectedCustomer?.id}
                  onValueChange={(value) => {
                    const customer = customers.find(c => c.id === value);
                    setSelectedCustomer(customer);
                  }}
                >
                  <SelectTrigger data-testid="customer-select">
                    <SelectValue placeholder="Escolha um cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map(customer => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.username} - Crédito: R$ {customer.credit.toFixed(2)} / Dívida: R$ {customer.debt.toFixed(2)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                data-testid="product-search"
                placeholder="Buscar produtos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Products Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {filteredProducts.map(product => (
                <Card
                  key={product.id}
                  className="cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => addToCart(product)}
                  data-testid={`product-${product.id}`}
                >
                  {product.image_url && (
                    <div className="aspect-square overflow-hidden rounded-t-lg">
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <CardContent className="p-3">
                    <h3 className="font-semibold text-sm mb-1">{product.name}</h3>
                    <div className="flex items-center justify-between">
                      <p className="text-lg font-bold text-emerald-600">
                        R$ {product.price.toFixed(2)}
                      </p>
                      <Badge variant={product.stock <= product.low_stock_threshold ? "destructive" : "secondary"}>
                        {product.stock}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Cart Section */}
          <div className="space-y-4">
            <Card className="sticky top-20">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <ShoppingCart className="mr-2 h-5 w-5" />
                  Carrinho
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="max-h-96 overflow-y-auto space-y-2" data-testid="cart-items">
                  {cart.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">Carrinho vazio</p>
                  ) : (
                    cart.map(item => (
                      <div key={item.id} className="flex items-center gap-2 border-b pb-2">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{item.name}</p>
                          <p className="text-sm text-muted-foreground">
                            R$ {item.price.toFixed(2)} x {item.quantity}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateQuantity(item.id, parseInt(e.target.value))}
                            className="w-16 h-8"
                            min="1"
                            data-testid={`quantity-${item.id}`}
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => removeFromCart(item.id)}
                            data-testid={`remove-${item.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="space-y-2 pt-4 border-t">
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total:</span>
                    <span data-testid="cart-total">R$ {calculateTotal().toFixed(2)}</span>
                  </div>

                  <Button
                    className="w-full"
                    onClick={() => setShowPayment(true)}
                    disabled={cart.length === 0 || !selectedCustomer}
                    data-testid="checkout-button"
                  >
                    Finalizar Venda
                  </Button>

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setCart([])}
                    disabled={cart.length === 0}
                    data-testid="clear-cart-button"
                  >
                    Limpar Carrinho
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Recent Sales */}
            <Card>
              <CardHeader>
                <CardTitle>Vendas Recentes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-64 overflow-y-auto" data-testid="recent-sales">
                  {recentSales.map(sale => (
                    <div key={sale.id} className="flex items-center justify-between border-b pb-2">
                      <div className="flex-1">
                        <p className="text-sm font-medium">R$ {sale.total.toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(sale.timestamp).toLocaleString('pt-BR')}
                        </p>
                      </div>
                      {sale.status === 'completed' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setCancelSaleId(sale.id);
                            setShowCancel(true);
                          }}
                          data-testid={`cancel-sale-${sale.id}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Payment Dialog */}
      <Dialog open={showPayment} onOpenChange={setShowPayment}>
        <DialogContent data-testid="payment-dialog">
          <DialogHeader>
            <DialogTitle>Método de Pagamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-center py-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
              <p className="text-sm text-muted-foreground">Total a pagar</p>
              <p className="text-3xl font-bold text-emerald-600">
                R$ {calculateTotal().toFixed(2)}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cash-input">Dinheiro Recebido (R$)</Label>
              <Input
                id="cash-input"
                data-testid="cash-input"
                type="number"
                step="0.01"
                value={cashAmount}
                onChange={(e) => setCashAmount(e.target.value)}
                placeholder="0.00"
              />
              {cashAmount && (
                <p className="text-sm">
                  Troco: <span className="font-bold">R$ {calculateChange().toFixed(2)}</span>
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={() => processSale('cash')}
                className="w-full"
                data-testid="pay-cash-button"
              >
                <Banknote className="mr-2 h-4 w-4" />
                Dinheiro
              </Button>
              <Button
                onClick={() => processSale('card')}
                className="w-full"
                data-testid="pay-card-button"
              >
                <CreditCard className="mr-2 h-4 w-4" />
                Cartão
              </Button>
              <Button
                onClick={() => processSale('credit')}
                className="w-full"
                disabled={!selectedCustomer || selectedCustomer.credit < calculateTotal()}
                data-testid="pay-credit-button"
              >
                <Wallet className="mr-2 h-4 w-4" />
                Crédito
              </Button>
              <Button
                onClick={() => processSale('fiado')}
                className="w-full"
                disabled={!selectedCustomer || selectedCustomer.debt >= 10}
                data-testid="pay-fiado-button"
              >
                <DollarSign className="mr-2 h-4 w-4" />
                Fiado
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancel Sale Dialog */}
      <Dialog open={showCancel} onOpenChange={setShowCancel}>
        <DialogContent data-testid="cancel-dialog">
          <DialogHeader>
            <DialogTitle>Cancelar Venda</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="cancel-reason">Motivo do Cancelamento *</Label>
              <Textarea
                id="cancel-reason"
                data-testid="cancel-reason-input"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Digite o motivo..."
                rows={4}
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCancel(false);
                  setCancelReason('');
                }}
                className="flex-1"
              >
                Voltar
              </Button>
              <Button
                onClick={cancelSale}
                variant="destructive"
                className="flex-1"
                data-testid="confirm-cancel-button"
              >
                Confirmar Cancelamento
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
