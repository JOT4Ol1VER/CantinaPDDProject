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
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { LogOut, CreditCard, DollarSign, History, Store, LayoutDashboard, Sun, Moon, Bell, BellOff, Instagram } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function CustomerPortal() {
  const navigate = useNavigate();
  const { user, logout, refreshUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [sales, setSales] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [creditAmount, setCreditAmount] = useState('');
  const [debtAmount, setDebtAmount] = useState('');
  const [creditReceipt, setCreditReceipt] = useState(null);
  const [debtReceipt, setDebtReceipt] = useState(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(user?.notifications_enabled || true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchSales();
    fetchTransactions();
  }, []);

  useEffect(() => {
    setNotificationsEnabled(user?.notifications_enabled || true);
  }, [user]);

  const fetchSales = async () => {
    try {
      const response = await axios.get(`${API}/sales`);
      setSales(response.data);
    } catch (error) {
      console.error('Failed to fetch sales:', error);
    }
  };

  const fetchTransactions = async () => {
    try {
      const response = await axios.get(`${API}/transactions`);
      setTransactions(response.data);
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
    }
  };

  const handleFileUpload = (e, type) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      if (type === 'credit') {
        setCreditReceipt(reader.result);
      } else {
        setDebtReceipt(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAddCredit = async () => {
    if (!creditAmount || !creditReceipt) {
      toast.error('Preencha o valor e faça upload do comprovante');
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API}/transactions`, {
        type: 'credit_add',
        amount: parseFloat(creditAmount),
        receipt_data: creditReceipt
      });
      toast.success('Solicitação de crédito enviada para análise!');
      setCreditAmount('');
      setCreditReceipt(null);
      fetchTransactions();
    } catch (error) {
      toast.error('Erro ao enviar solicitação');
    } finally {
      setLoading(false);
    }
  };

  const handlePayDebt = async () => {
    if (!debtAmount || !debtReceipt) {
      toast.error('Preencha o valor e faça upload do comprovante');
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API}/transactions`, {
        type: 'debt_payment',
        amount: parseFloat(debtAmount),
        receipt_data: debtReceipt
      });
      toast.success('Pagamento enviado para análise!');
      setDebtAmount('');
      setDebtReceipt(null);
      fetchTransactions();
    } catch (error) {
      toast.error('Erro ao enviar pagamento');
    } finally {
      setLoading(false);
    }
  };

  const toggleNotifications = async () => {
    try {
      await axios.patch(`${API}/users/${user.id}/notifications`, {
        enabled: !notificationsEnabled
      });
      setNotificationsEnabled(!notificationsEnabled);
      toast.success('Configuração atualizada!');
      refreshUser();
    } catch (error) {
      toast.error('Erro ao atualizar configuração');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-emerald-700 dark:text-emerald-400" data-testid="portal-title">
                Cantina Projeto de Deus
              </h1>
              <p className="text-sm text-muted-foreground">Olá, {user?.username}!</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                data-testid="theme-toggle-button"
              >
                {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
              </Button>
              {(user?.role === 'seller' || user?.role === 'admin') && (
                <Button
                  variant="outline"
                  onClick={() => navigate('/terminal')}
                  data-testid="terminal-button"
                >
                  <Store className="mr-2 h-4 w-4" />
                  Terminal
                </Button>
              )}
              {user?.role === 'admin' && (
                <Button
                  variant="outline"
                  onClick={() => navigate('/admin')}
                  data-testid="admin-button"
                >
                  <LayoutDashboard className="mr-2 h-4 w-4" />
                  Admin
                </Button>
              )}
              <Button variant="ghost" onClick={logout} data-testid="logout-button">
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {/* Balance Cards */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <Card className="border-emerald-200 dark:border-emerald-800">
            <CardHeader>
              <CardTitle className="flex items-center text-emerald-700 dark:text-emerald-400">
                <CreditCard className="mr-2 h-5 w-5" />
                Crédito Disponível
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-emerald-600 dark:text-emerald-400" data-testid="credit-balance">
                R$ {user?.credit?.toFixed(2) || '0.00'}
              </div>
            </CardContent>
          </Card>

          <Card className="border-red-200 dark:border-red-800">
            <CardHeader>
              <CardTitle className="flex items-center text-red-700 dark:text-red-400">
                <DollarSign className="mr-2 h-5 w-5" />
                Débito Pendente
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-red-600 dark:text-red-400" data-testid="debt-balance">
                R$ {user?.debt?.toFixed(2) || '0.00'}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="add-credit" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="add-credit" data-testid="add-credit-tab">Adicionar Crédito</TabsTrigger>
            <TabsTrigger value="pay-debt" data-testid="pay-debt-tab">Pagar Débito</TabsTrigger>
            <TabsTrigger value="history" data-testid="history-tab">Histórico</TabsTrigger>
            <TabsTrigger value="settings" data-testid="settings-tab">Configurações</TabsTrigger>
          </TabsList>

          <TabsContent value="add-credit" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Adicionar Crédito</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-lg">
                  <p className="text-sm font-medium mb-2">Chave Pix para pagamento:</p>
                  <p className="text-lg font-bold">21999154315</p>
                  <p className="text-sm text-muted-foreground">Camily Witoria Ramos da Silva</p>
                  <p className="text-sm text-muted-foreground">MERCADO PAGO IP LTDA</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="credit-amount">Valor (R$)</Label>
                  <Input
                    id="credit-amount"
                    data-testid="credit-amount-input"
                    type="number"
                    step="0.01"
                    value={creditAmount}
                    onChange={(e) => setCreditAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="credit-receipt">Comprovante Pix</Label>
                  <Input
                    id="credit-receipt"
                    data-testid="credit-receipt-input"
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFileUpload(e, 'credit')}
                  />
                  {creditReceipt && (
                    <p className="text-sm text-emerald-600">✓ Comprovante carregado</p>
                  )}
                </div>
                <Button
                  onClick={handleAddCredit}
                  disabled={loading}
                  className="w-full"
                  data-testid="submit-credit-button"
                >
                  Enviar Solicitação
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pay-debt" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Pagar Débito</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
                  <p className="text-sm font-medium mb-2">Débito atual:</p>
                  <p className="text-2xl font-bold">R$ {user?.debt?.toFixed(2) || '0.00'}</p>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-lg">
                  <p className="text-sm font-medium mb-2">Chave Pix para pagamento:</p>
                  <p className="text-lg font-bold">21999154315</p>
                  <p className="text-sm text-muted-foreground">Camily Witoria Ramos da Silva</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="debt-amount">Valor (R$)</Label>
                  <Input
                    id="debt-amount"
                    data-testid="debt-amount-input"
                    type="number"
                    step="0.01"
                    value={debtAmount}
                    onChange={(e) => setDebtAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="debt-receipt">Comprovante Pix</Label>
                  <Input
                    id="debt-receipt"
                    data-testid="debt-receipt-input"
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFileUpload(e, 'debt')}
                  />
                  {debtReceipt && (
                    <p className="text-sm text-emerald-600">✓ Comprovante carregado</p>
                  )}
                </div>
                <Button
                  onClick={handlePayDebt}
                  disabled={loading}
                  className="w-full"
                  data-testid="submit-debt-button"
                >
                  Enviar Pagamento
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Histórico de Compras</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4" data-testid="sales-history">
                  {sales.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">Nenhuma compra realizada</p>
                  ) : (
                    sales.map((sale) => (
                      <div
                        key={sale.id}
                        className="border rounded-lg p-4 hover:bg-accent"
                        data-testid={`sale-${sale.id}`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-medium">
                              {new Date(sale.timestamp).toLocaleDateString('pt-BR')}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {sale.payment_method === 'cash' && 'Dinheiro'}
                              {sale.payment_method === 'card' && 'Cartão'}
                              {sale.payment_method === 'credit' && 'Crédito'}
                              {sale.payment_method === 'fiado' && 'Fiado'}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold">R$ {sale.total.toFixed(2)}</p>
                            {sale.status === 'cancelled' && (
                              <p className="text-xs text-red-600">Cancelado</p>
                            )}
                          </div>
                        </div>
                        <div className="text-sm space-y-1">
                          {sale.items.map((item, idx) => (
                            <div key={idx} className="flex justify-between">
                              <span>{item.quantity}x {item.name}</span>
                              <span>R$ {(item.quantity * item.unit_price).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Histórico de Transações</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4" data-testid="transactions-history">
                  {transactions.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">Nenhuma transação</p>
                  ) : (
                    transactions.map((transaction) => (
                      <div
                        key={transaction.id}
                        className="border rounded-lg p-4"
                        data-testid={`transaction-${transaction.id}`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium">
                              {transaction.type === 'credit_add' ? 'Adicionar Crédito' : 'Pagar Débito'}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(transaction.timestamp).toLocaleDateString('pt-BR')}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold">R$ {transaction.amount.toFixed(2)}</p>
                            <p className={`text-xs ${
                              transaction.status === 'approved' ? 'text-emerald-600' :
                              transaction.status === 'rejected' ? 'text-red-600' :
                              'text-yellow-600'
                            }`}>
                              {transaction.status === 'approved' && 'Aprovado'}
                              {transaction.status === 'rejected' && 'Rejeitado'}
                              {transaction.status === 'pending' && 'Pendente'}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Configurações</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Tema</Label>
                    <p className="text-sm text-muted-foreground">
                      {theme === 'light' ? 'Modo Claro' : 'Modo Escuro'}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={toggleTheme}
                    data-testid="settings-theme-toggle"
                  >
                    {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Notificações Push</Label>
                    <p className="text-sm text-muted-foreground">
                      Receber notificações do sistema
                    </p>
                  </div>
                  <Switch
                    checked={notificationsEnabled}
                    onCheckedChange={toggleNotifications}
                    data-testid="notifications-toggle"
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Footer */}
      <footer className="border-t bg-card mt-12">
        <div className="container mx-auto px-4 py-6 text-center">
          <a
            href="https://instagram.com/igrejaprojetodedeus"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground"
            data-testid="instagram-link"
          >
            <Instagram className="h-5 w-5" />
            @igrejaprojetodedeus
          </a>
        </div>
      </footer>
    </div>
  );
}
