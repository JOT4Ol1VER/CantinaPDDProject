import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useTheme } from '@/App';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import {
  ArrowLeft, Users, Package, CreditCard, BarChart3, Bell,
  CheckCircle, XCircle, Edit2, Trash2, Plus, Sun, Moon,
  Upload, Search, Send
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  
  // State
  const [users, setUsers] = useState([]);
  const [products, setProducts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [sales, setSales] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  
  // Product form
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productForm, setProductForm] = useState({
    name: '',
    price: '',
    stock: '',
    low_stock_threshold: '10',
    category: 'general',
    image_url: '',
    volume_pricing: []
  });
  
  // Push notification
  const [showPushDialog, setShowPushDialog] = useState(false);
  const [pushMessage, setPushMessage] = useState('');
  const [pushTargetType, setPushTargetType] = useState('all_users');
  const [pushTargetRole, setPushTargetRole] = useState('customer');
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [usersRes, productsRes, transactionsRes, salesRes, lowStockRes, pendingRes] = await Promise.all([
        axios.get(`${API}/users`),
        axios.get(`${API}/products`),
        axios.get(`${API}/transactions`),
        axios.get(`${API}/sales`),
        axios.get(`${API}/stats/low-stock`),
        axios.get(`${API}/stats/pending-transactions`)
      ]);
      
      setUsers(usersRes.data);
      setProducts(productsRes.data);
      setTransactions(transactionsRes.data);
      setSales(salesRes.data);
      setLowStock(lowStockRes.data);
      setPendingCount(pendingRes.data.count);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    }
  };

  // User management
  const updateUserRole = async (userId, newRole) => {
    try {
      await axios.patch(`${API}/users/${userId}/role`, { role: newRole });
      toast.success('Permissão atualizada!');
      fetchData();
    } catch (error) {
      toast.error('Erro ao atualizar permissão');
    }
  };

  // Product management
  const openProductForm = (product = null) => {
    if (product) {
      setEditingProduct(product);
      setProductForm({
        name: product.name,
        price: product.price.toString(),
        stock: product.stock.toString(),
        low_stock_threshold: product.low_stock_threshold.toString(),
        category: product.category,
        image_url: product.image_url,
        volume_pricing: product.volume_pricing || []
      });
    } else {
      setEditingProduct(null);
      setProductForm({
        name: '',
        price: '',
        stock: '',
        low_stock_threshold: '10',
        category: 'general',
        image_url: '',
        volume_pricing: []
      });
    }
    setShowProductForm(true);
  };

  const handleImageUpload = async (e, productId = null) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const imageData = reader.result;
      
      if (productId) {
        // Upload to existing product
        try {
          await axios.post(`${API}/products/${productId}/upload-image`, {
            image_data: imageData
          });
          toast.success('Imagem atualizada!');
          fetchData();
        } catch (error) {
          toast.error('Erro ao fazer upload da imagem');
        }
      } else {
        // Set for new product
        setProductForm({ ...productForm, image_url: imageData });
      }
    };
    reader.readAsDataURL(file);
  };

  const saveProduct = async () => {
    try {
      const productData = {
        name: productForm.name,
        price: parseFloat(productForm.price),
        stock: parseInt(productForm.stock),
        low_stock_threshold: parseInt(productForm.low_stock_threshold),
        category: productForm.category,
        image_url: productForm.image_url,
        volume_pricing: productForm.volume_pricing
      };

      if (editingProduct) {
        await axios.put(`${API}/products/${editingProduct.id}`, productData);
        toast.success('Produto atualizado!');
      } else {
        await axios.post(`${API}/products`, productData);
        toast.success('Produto criado!');
      }
      
      setShowProductForm(false);
      fetchData();
    } catch (error) {
      toast.error('Erro ao salvar produto');
    }
  };

  const deleteProduct = async (productId) => {
    if (!window.confirm('Deseja realmente excluir este produto?')) return;
    
    try {
      await axios.delete(`${API}/products/${productId}`);
      toast.success('Produto excluído!');
      fetchData();
    } catch (error) {
      toast.error('Erro ao excluir produto');
    }
  };

  // Transaction review
  const reviewTransaction = async (transactionId, status, note = '') => {
    try {
      await axios.patch(`${API}/transactions/${transactionId}/review`, {
        status,
        admin_note: note
      });
      toast.success(status === 'approved' ? 'Transação aprovada!' : 'Transação rejeitada');
      fetchData();
    } catch (error) {
      toast.error('Erro ao processar transação');
    }
  };

  // Push notifications
  const sendPushNotification = async () => {
    if (!pushMessage.trim()) {
      toast.error('Digite uma mensagem');
      return;
    }

    try {
      const payload = {
        message: pushMessage,
        target_type: pushTargetType,
        target_role: pushTargetType === 'role' ? pushTargetRole : undefined,
        target_user_ids: pushTargetType === 'manual' ? selectedUserIds : undefined
      };

      const response = await axios.post(`${API}/push/send`, payload);
      toast.success(`Notificação enviada para ${response.data.recipients} usuários!`);
      setPushMessage('');
      setShowPushDialog(false);
    } catch (error) {
      toast.error('Erro ao enviar notificação');
    }
  };

  const filteredUsersForPush = users.filter(u =>
    u.username.toLowerCase().includes(userSearchTerm.toLowerCase())
  );

  const toggleUserSelection = (userId) => {
    if (selectedUserIds.includes(userId)) {
      setSelectedUserIds(selectedUserIds.filter(id => id !== userId));
    } else {
      setSelectedUserIds([...selectedUserIds, userId]);
    }
  };

  // Sales report
  const totalSales = sales.reduce((sum, sale) => 
    sale.status === 'completed' ? sum + sale.total : sum, 0
  );
  const cancelledSales = sales.filter(s => s.status === 'cancelled');

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
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
                <h1 className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                  Painel Administrativo
                </h1>
                <p className="text-sm text-muted-foreground">Gestão Completa</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={toggleTheme} data-testid="theme-toggle">
                {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {/* Stats Cards */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Usuários</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="users-count">{users.length}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Produtos</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="products-count">{products.length}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Transações Pendentes</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600" data-testid="pending-count">
                {pendingCount}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Vendas</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600" data-testid="total-sales">
                R$ {totalSales.toFixed(2)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Low Stock Alert */}
        {lowStock.length > 0 && (
          <Card className="mb-8 border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20">
            <CardHeader>
              <CardTitle className="text-orange-700 dark:text-orange-400">
                ⚠️ Alerta de Estoque Baixo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2" data-testid="low-stock-alerts">
                {lowStock.map(product => (
                  <div key={product.id} className="flex justify-between items-center">
                    <span className="font-medium">{product.name}</span>
                    <Badge variant="destructive">
                      Estoque: {product.stock} (Limite: {product.low_stock_threshold})
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <Tabs defaultValue="users" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="users" data-testid="users-tab">Usuários</TabsTrigger>
            <TabsTrigger value="products" data-testid="products-tab">Produtos</TabsTrigger>
            <TabsTrigger value="transactions" data-testid="transactions-tab">Transações</TabsTrigger>
            <TabsTrigger value="reports" data-testid="reports-tab">Relatórios</TabsTrigger>
            <TabsTrigger value="push" data-testid="push-tab">Notificações</TabsTrigger>
          </TabsList>

          {/* Users Tab */}
          <TabsContent value="users" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Gestão de Usuários</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4" data-testid="users-list">
                  {users.map(u => (
                    <div key={u.id} className="flex items-center justify-between border-b pb-4">
                      <div>
                        <p className="font-medium">{u.username}</p>
                        <p className="text-sm text-muted-foreground">
                          Crédito: R$ {u.credit.toFixed(2)} | Dívida: R$ {u.debt.toFixed(2)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge>{u.role === 'admin' ? 'Admin' : u.role === 'seller' ? 'Vendedor' : 'Cliente'}</Badge>
                        {u.role !== 'admin' && (
                          <Select
                            value={u.role}
                            onValueChange={(value) => updateUserRole(u.id, value)}
                          >
                            <SelectTrigger className="w-32" data-testid={`role-select-${u.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="customer">Cliente</SelectItem>
                              <SelectItem value="seller">Vendedor</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Products Tab */}
          <TabsContent value="products" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Produtos</h2>
              <Button onClick={() => openProductForm()} data-testid="add-product-button">
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Produto
              </Button>
            </div>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {products.map(product => (
                <Card key={product.id} data-testid={`product-card-${product.id}`}>
                  {product.image_url && (
                    <div className="aspect-video overflow-hidden rounded-t-lg">
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-bold">{product.name}</h3>
                        <p className="text-sm text-muted-foreground">{product.category}</p>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openProductForm(product)}
                          data-testid={`edit-product-${product.id}`}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteProduct(product.id)}
                          data-testid={`delete-product-${product.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <p className="text-lg font-bold text-emerald-600">
                        R$ {product.price.toFixed(2)}
                      </p>
                      <Badge variant={product.stock <= product.low_stock_threshold ? "destructive" : "secondary"}>
                        Estoque: {product.stock}
                      </Badge>
                    </div>
                    <div className="mt-2">
                      <Label htmlFor={`upload-${product.id}`} className="cursor-pointer">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                          <Upload className="h-4 w-4" />
                          Atualizar imagem
                        </div>
                      </Label>
                      <Input
                        id={`upload-${product.id}`}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleImageUpload(e, product.id)}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Transactions Tab */}
          <TabsContent value="transactions" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Transações Pendentes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4" data-testid="transactions-list">
                  {transactions.filter(t => t.status === 'pending').length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">Nenhuma transação pendente</p>
                  ) : (
                    transactions.filter(t => t.status === 'pending').map(transaction => (
                      <div key={transaction.id} className="border rounded-lg p-4 space-y-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium">
                              {transaction.type === 'credit_add' ? 'Adicionar Crédito' : 'Pagar Dívida'}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Usuário: {users.find(u => u.id === transaction.user_id)?.username}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(transaction.timestamp).toLocaleString('pt-BR')}
                            </p>
                          </div>
                          <p className="text-xl font-bold">R$ {transaction.amount.toFixed(2)}</p>
                        </div>
                        
                        {transaction.receipt_url && (
                          <div>
                            <img
                              src={transaction.receipt_url}
                              alt="Comprovante"
                              className="max-w-xs rounded border"
                            />
                          </div>
                        )}
                        
                        <div className="flex gap-2">
                          <Button
                            className="flex-1"
                            onClick={() => reviewTransaction(transaction.id, 'approved')}
                            data-testid={`approve-${transaction.id}`}
                          >
                            <CheckCircle className="mr-2 h-4 w-4" />
                            Aprovar
                          </Button>
                          <Button
                            variant="destructive"
                            className="flex-1"
                            onClick={() => reviewTransaction(transaction.id, 'rejected', 'Comprovante inválido')}
                            data-testid={`reject-${transaction.id}`}
                          >
                            <XCircle className="mr-2 h-4 w-4" />
                            Rejeitar
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Reports Tab */}
          <TabsContent value="reports" className="space-y-4">
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Relatório de Vendas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span>Total de Vendas:</span>
                    <span className="font-bold">R$ {totalSales.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Vendas Completadas:</span>
                    <span className="font-bold">{sales.filter(s => s.status === 'completed').length}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Vendas Canceladas:</span>
                    <span className="font-bold text-red-600">{cancelledSales.length}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Vendas Canceladas</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-96 overflow-y-auto" data-testid="cancelled-sales">
                    {cancelledSales.map(sale => (
                      <div key={sale.id} className="border-b pb-2">
                        <div className="flex justify-between">
                          <span className="text-sm">R$ {sale.total.toFixed(2)}</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(sale.timestamp).toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                        <p className="text-xs text-red-600">Motivo: {sale.cancellation_reason}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Push Notifications Tab */}
          <TabsContent value="push" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Enviar Notificações Push</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="push-message">Mensagem</Label>
                  <Textarea
                    id="push-message"
                    data-testid="push-message-input"
                    value={pushMessage}
                    onChange={(e) => setPushMessage(e.target.value)}
                    placeholder="Digite sua mensagem..."
                    rows={4}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Público-Alvo</Label>
                  <Select value={pushTargetType} onValueChange={setPushTargetType}>
                    <SelectTrigger data-testid="target-type-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all_users">Todos os Usuários</SelectItem>
                      <SelectItem value="role">Por Função</SelectItem>
                      <SelectItem value="debtors">Devedores</SelectItem>
                      <SelectItem value="manual">Seleção Manual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {pushTargetType === 'role' && (
                  <div className="space-y-2">
                    <Label>Função</Label>
                    <Select value={pushTargetRole} onValueChange={setPushTargetRole}>
                      <SelectTrigger data-testid="role-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="customer">Clientes</SelectItem>
                        <SelectItem value="seller">Vendedores</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {pushTargetType === 'manual' && (
                  <div className="space-y-2">
                    <Label>Selecionar Usuários</Label>
                    <Input
                      placeholder="Buscar usuários..."
                      value={userSearchTerm}
                      onChange={(e) => setUserSearchTerm(e.target.value)}
                      data-testid="user-search-input"
                    />
                    <div className="border rounded-lg p-4 max-h-64 overflow-y-auto space-y-2">
                      {filteredUsersForPush.map(u => (
                        <div key={u.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`user-${u.id}`}
                            checked={selectedUserIds.includes(u.id)}
                            onCheckedChange={() => toggleUserSelection(u.id)}
                            data-testid={`checkbox-${u.id}`}
                          />
                          <label htmlFor={`user-${u.id}`} className="flex-1 cursor-pointer">
                            {u.username}
                          </label>
                        </div>
                      ))}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {selectedUserIds.length} usuário(s) selecionado(s)
                    </p>
                  </div>
                )}

                <Button
                  onClick={sendPushNotification}
                  className="w-full"
                  data-testid="send-push-button"
                >
                  <Send className="mr-2 h-4 w-4" />
                  Enviar Notificação
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Product Form Dialog */}
      <Dialog open={showProductForm} onOpenChange={setShowProductForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="product-form-dialog">
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? 'Editar Produto' : 'Novo Produto'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="product-name">Nome</Label>
              <Input
                id="product-name"
                data-testid="product-name-input"
                value={productForm.name}
                onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="product-price">Preço (R$)</Label>
                <Input
                  id="product-price"
                  data-testid="product-price-input"
                  type="number"
                  step="0.01"
                  value={productForm.price}
                  onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="product-stock">Estoque</Label>
                <Input
                  id="product-stock"
                  data-testid="product-stock-input"
                  type="number"
                  value={productForm.stock}
                  onChange={(e) => setProductForm({ ...productForm, stock: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="product-category">Categoria</Label>
                <Input
                  id="product-category"
                  data-testid="product-category-input"
                  value={productForm.category}
                  onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="product-threshold">Limite Estoque Baixo</Label>
                <Input
                  id="product-threshold"
                  data-testid="product-threshold-input"
                  type="number"
                  value={productForm.low_stock_threshold}
                  onChange={(e) => setProductForm({ ...productForm, low_stock_threshold: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="product-image">Imagem do Produto</Label>
              <Input
                id="product-image"
                data-testid="product-image-input"
                type="file"
                accept="image/*"
                onChange={(e) => handleImageUpload(e)}
              />
              {productForm.image_url && (
                <img src={productForm.image_url} alt="Preview" className="max-w-xs rounded" />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProductForm(false)}>
              Cancelar
            </Button>
            <Button onClick={saveProduct} data-testid="save-product-button">
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
