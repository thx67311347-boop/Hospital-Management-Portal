'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { 
  AlertTriangle, 
  AlertCircle, 
  CheckCircle2, 
  Plus, 
  Trash2, 
  ClipboardList, 
  Layers, 
  Search,
  Users,
  Phone,
  Mail,
  Building2,
  FolderPlus,
  Folder,
  ArrowLeft,
  RefreshCw,
  Calendar,
  Edit3,
  Sparkles,
  Lock,
  Unlock,
  PackageCheck,
  HandHelping,
  BarChart3,
  Camera,
  MapPin,
  X,
  PhoneCall,
  Download,
  Archive,
  ShieldCheck
} from 'lucide-react';

const supabaseUrl = 'https://jdlgoleiwdsnimambtpn.supabase.co';
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const DEFAULT_CATEGORIES = [
  'ANA Machine consumables',
  'NRFit',
  'ETT',
  'Fiber',
  'Mask',
  'Others'
];

type ItemStatus = 'sufficient' | 'warning_1m' | 'warning_60d' | 'out_of_stock';

interface Consumable {
  id: string;
  category: string;
  name: string;
  brand: string | null;
  product_code: string | null;
  size: string | null;
  has_ha_code: boolean;
  ha_code: string | null;
  sales_contact: string | null;
  current_qty: number;
  min_qty: number;
  status: ItemStatus;
  location_part1: string | null; 
  location_part2: string | null; 
  location_free: string | null;  
  is_latex_free?: boolean;
}

interface DeliveryBatch {
  qty: number;
  lot: string;
  date: string;
}

interface OrderHistory {
  id: string;
  item_id: string;
  item_name?: string;
  product_code?: string;
  pr_number: string | null;
  po_number?: string | null;
  order_qty: number;
  received_qty: number;
  order_date: string | null;
  month_tag?: string;
  status: string;
  lot_number?: string | null;
  item_size?: string | null;
  deliveries?: DeliveryBatch[]; // 支援儲存多次分批送貨明細
}

interface BorrowRecord {
  id: string;
  item_name: string;
  borrow_qty: number;
  borrow_date: string;
  return_due_date: string;
  pr_number: string | null;
  po_number?: string | null;
  status: string;
  remarks: string | null;
}

interface InventoryLog {
  id: string;
  item_id: string;
  changed_qty: number;
  created_at: string;
}

interface SalesContact {
  id: string;
  company_name: string;
  sales_name: string;
  phone: string;
  email: string | null;
  remarks: string | null;
  is_auto?: boolean;
}

const isWarningStatus = (status: string | null | undefined) => {
  return status === 'warning_1m' || status === 'warning_60d';
};

export default function Home() {
  const [activeTab, setActiveTab] = useState<'inventory' | 'orders' | 'borrow' | 'sales' | 'ai_predict'>('inventory');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'out_of_stock' | 'warning_60d'>('all');
  const [items, setItems] = useState<Consumable[]>([]);
  const [orders, setOrders] = useState<OrderHistory[]>([]);
  const [borrows, setBorrows] = useState<BorrowRecord[]>([]);
  const [logs, setLogs] = useState<InventoryLog[]>([]);
  const [salesList, setSalesList] = useState<SalesContact[]>([]);
  const [search, setSearch] = useState('');
  const [salesSearch, setSalesSearch] = useState('');
  
  const [archiveSearch, setArchiveSearch] = useState('');
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddSalesModal, setShowAddSalesModal] = useState(false);
  const [showBorrowModal, setShowBorrowModal] = useState(false);
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [showManualOrderModal, setShowManualOrderModal] = useState(false);

  const [syncingSales, setSyncingSales] = useState(false);
  const [selectedOrderMonth, setSelectedOrderMonth] = useState<string>('All');
  
  const [statsYearFilter, setStatsYearFilter] = useState<string>('2026');
  const [statsMonthFilter, setStatsMonthFilter] = useState<string>('All');

  const [todayStr, setTodayStr] = useState('2026-11-01');

  const [manualOrderForm, setManualOrderForm] = useState({
    item_id: '',
    pr_number: '',
    order_qty: 10,
    order_date: '2026-11-01'
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const [editingSalesId, setEditingSalesId] = useState<string | null>(null);
  const [editSalesForm, setEditSalesForm] = useState({ company_name: '', sales_name: '', phone: '', email: '', remarks: '' });

  const [isAdmin, setIsAdmin] = useState(false);
  const [extraCategories, setExtraCategories] = useState<string[]>([]);
  const [isAddingCustomCategory, setIsAddingCustomCategory] = useState(false);
  const [customCategoryInput, setCustomCategoryInput] = useState('');
  const [hiddenShortageIds, setHiddenShortageIds] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    category: 'Others',
    name: '',
    brand: '',
    product_code: '',
    size: '',
    has_ha_code: false,
    ha_code: '',
    sales_contact: '',
    current_qty: 0,
    min_qty: 5,
    status: 'sufficient' as ItemStatus,
    location_part1: 'OT1',
    location_part2: 'A',
    location_free: '',
    is_latex_free: false
  });

  const [borrowForm, setBorrowForm] = useState({
    item_name: '',
    borrow_qty: 1,
    borrow_date: '2026-11-01',
    return_due_date: '',
    pr_number: '',
    po_number: '',
    remarks: ''
  });

  const [salesForm, setSalesForm] = useState({
    company_name: '',
    sales_name: '',
    phone: '',
    email: '',
    remarks: '',
  });

  useEffect(() => {
    try {
      const today = new Date().toISOString().split('T')[0];
      setTodayStr(today);
      setBorrowForm(prev => ({ ...prev, borrow_date: today }));
      setManualOrderForm(prev => ({ ...prev, order_date: today }));

      const savedCat = localStorage.getItem('ana_custom_categories');
      if (savedCat) setExtraCategories(JSON.parse(savedCat));
    } catch (e) {
      console.error(e);
    }
  }, []);

  const startCamera = async () => {
    setShowScannerModal(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err) {
      console.error('相機啟動失敗:', err);
      alert('無法開啟手機相機，請檢查相機權限！');
    }
  };

  const stopCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      mediaStreamRef.current = null;
    }
    setShowScannerModal(false);
  };

  const allCategories = useMemo(() => {
    const list = Array.from(
      new Set([
        ...DEFAULT_CATEGORIES,
        ...extraCategories,
        ...(items || []).map(i => i.category).filter(Boolean)
      ])
    );
    return list.sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'accent' }));
  }, [extraCategories, items]);

  const handleAdminLogin = () => {
    if (isAdmin) {
      setIsAdmin(false);
      alert('已成功登出管理員模式！');
      return;
    }
    const pwd = prompt('請輸入管理員密碼：');
    if (pwd === '34087499') {
      setIsAdmin(true);
      alert('管理員登入成功！已解鎖所有編輯與管理權限。');
    } else if (pwd !== null) {
      alert('密碼錯誤！');
    }
  };

  const handleCreateNewCategory = () => {
    if (!isAdmin) return;
    const newCat = prompt('請輸入新分類名稱：');
    if (newCat && newCat.trim()) {
      const trimmed = newCat.trim();
      const updated = Array.from(new Set([...extraCategories, trimmed]));
      setExtraCategories(updated);
      localStorage.setItem('ana_custom_categories', JSON.stringify(updated));
    }
  };

  const fetchData = async () => {
    try {
      const { data: itemData } = await supabase.from('consumables').select('*').order('name', { ascending: true });
      if (itemData) setItems(itemData as Consumable[]);

      const { data: orderData } = await supabase.from('order_history').select('*').order('order_date', { ascending: false });
      if (orderData) {
        const mappedOrders = orderData.map((o: OrderHistory) => {
          const matchedItem = (itemData || []).find((i: Consumable) => i.id === o.item_id);
          let parsedDeliveries: DeliveryBatch[] = [];
          try {
            if (o.deliveries && typeof o.deliveries === 'string') {
              parsedDeliveries = JSON.parse(o.deliveries);
            } else if (Array.isArray(o.deliveries)) {
              parsedDeliveries = o.deliveries;
            }
          } catch (e) {
            parsedDeliveries = [];
          }

          // 如果沒有 deliveries 陣列，但有舊的 received_qty 同 lot_number，自動轉成第一筆
          if (parsedDeliveries.length === 0 && Number(o.received_qty) > 0) {
            parsedDeliveries.push({
              qty: Number(o.received_qty),
              lot: o.lot_number || '-',
              date: o.order_date || todayStr
            });
          }

          return {
            ...o,
            item_size: matchedItem ? matchedItem.size : '-',
            deliveries: parsedDeliveries
          };
        });
        setOrders(mappedOrders);
      }

      const { data: borrowData } = await supabase.from('borrow_records').select('*').order('borrow_date', { ascending: false });
      if (borrowData) setBorrows(borrowData as BorrowRecord[]);

      const { data: logData } = await supabase.from('inventory_logs').select('*');
      if (logData) setLogs(logData as InventoryLog[]);

      const { data: salesData } = await supabase.from('sales_contacts').select('*');
      if (salesData) setSalesList(salesData as SalesContact[]);
    } catch (err) {
      console.error('Fetch error:', err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleStatusChange = async (item: Consumable, selectedValue: string) => {
    if (!isAdmin) return;
    const dbStatus: ItemStatus = selectedValue === 'warning_60d' ? 'warning_1m' : (selectedValue as ItemStatus);
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: dbStatus } : i));
    await supabase.from('consumables').update({ status: dbStatus }).eq('id', item.id);
    fetchData();
  };

  const handleCategoryChange = async (item: Consumable, newCat: string) => {
    if (!isAdmin) return;
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, category: newCat } : i));
    await supabase.from('consumables').update({ category: newCat }).eq('id', item.id);
    fetchData();
  };

  const handleToggleLatexFree = async (item: Consumable) => {
    if (!isAdmin) return;
    const nextVal = !item.is_latex_free;
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_latex_free: nextVal } : i));
    const { error } = await supabase.from('consumables').update({ is_latex_free: nextVal }).eq('id', item.id);
    if (error) {
      alert('更新 Latex Free 失敗：' + error.message);
      fetchData();
    }
  };

  const handleCardUpdateSales = async (item: Consumable) => {
    if (!isAdmin) return;
    const input = prompt(`請輸入「${item.brand || '此品牌'}」的新 Sales 聯絡資料 (例如: Eric 92202553)：`, item.sales_contact || '');
    if (input === null) return;
    const newContact = input.trim();

    if (item.brand && item.brand.trim()) {
      const brandKey = item.brand.trim().toLowerCase();
      const matching = items.filter(i => i.brand && i.brand.trim().toLowerCase() === brandKey);
      for (const m of matching) {
        await supabase.from('consumables').update({ sales_contact: newContact }).eq('id', m.id);
      }
    } else {
      await supabase.from('consumables').update({ sales_contact: newContact }).eq('id', item.id);
    }

    fetchData();
    alert('Sales 聯絡資料已成功更新，並已同步所有同品牌耗材！');
  };

  const handleCallSalesAction = (item: Consumable) => {
    const text = `【CMC麻醉科耗材補貨通知】你好！我地部門嘅 「${item.name}」(Size: ${item.size || 'N/A'}, Product Code: ${item.product_code || 'N/A'}) 現時存量已進入60天預警/不足 (現存: ${item.current_qty} EA)，請代為出 Quotation 安排報價及補貨。唔該曬！`;

    navigator.clipboard.writeText(text).then(() => {
      let phoneNum = '';
      const rawContact = item.sales_contact || '';
      const phoneMatch = rawContact.match(/(\d{8})/);
      if (phoneMatch) {
        phoneNum = phoneMatch[1];
      } else {
        const found = salesList.find(s => item.brand && s.company_name.toLowerCase().includes(item.brand.toLowerCase()));
        if (found) phoneNum = found.phone;
      }

      if (phoneNum) {
        const cleanPhone = phoneNum.replace(/[^0-9]/g, '');
        if (confirm(`【已成功複製 WhatsApp 訊息！】\n\n內容：\n${text}\n\n是否立即透過 WhatsApp 聯絡 Sales (${phoneNum})？`)) {
          window.open(`https://wa.me/852${cleanPhone}?text=${encodeURIComponent(text)}`, '_blank');
        }
      } else {
        alert(`【已成功複製 WhatsApp 訊息到剪貼簿！】\n\n內容預覽：\n${text}\n\n（提示：此物料未有登記 Sales 電話，你可以直接到 WhatsApp 貼上發送）`);
      }
    }).catch(err => {
      console.error('複製失敗', err);
      alert('複製失敗，請手動複製。');
    });
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    const finalCategory = isAddingCustomCategory && customCategoryInput.trim() 
      ? customCategoryInput.trim() 
      : formData.category;

    if (isAddingCustomCategory && customCategoryInput.trim()) {
      const updated = Array.from(new Set([...extraCategories, customCategoryInput.trim()]));
      setExtraCategories(updated);
      localStorage.setItem('ana_custom_categories', JSON.stringify(updated));
    }

    const dbStatus: ItemStatus = formData.status === 'warning_60d' ? 'warning_1m' : formData.status;

    const { error } = await supabase.from('consumables').insert([{
      ...formData,
      category: finalCategory,
      status: dbStatus
    }]);

    if (!error) {
      setShowAddModal(false);
      setIsAddingCustomCategory(false);
      setCustomCategoryInput('');
      setFormData({
        category: selectedCategory && selectedCategory !== 'All' ? selectedCategory : 'Others',
        name: '',
        brand: '',
        product_code: '',
        size: '',
        has_ha_code: false,
        ha_code: '',
        sales_contact: '',
        current_qty: 0,
        min_qty: 5,
        status: 'sufficient',
        location_part1: 'OT1',
        location_part2: 'A',
        location_free: '',
        is_latex_free: false
      });
      fetchData();
      alert('成功新增物料！');
    } else {
      alert('新增失敗：' + error.message);
    }
  };

  const handleManualAddOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    if (!manualOrderForm.item_id) {
      alert('請選擇要下單的物品！');
      return;
    }
    if (!manualOrderForm.pr_number || !manualOrderForm.pr_number.trim()) {
      alert('請輸入 PR 號碼！');
      return;
    }
    if (!manualOrderForm.order_qty || manualOrderForm.order_qty <= 0) {
      alert('請輸入有效的下單數量！');
      return;
    }

    const targetItem = items.find(i => i.id === manualOrderForm.item_id);
    if (!targetItem) {
      alert('找不到該物品資料！');
      return;
    }

    const dateStr = manualOrderForm.order_date || todayStr;
    const monthTag = dateStr.substring(0, 7);

    const { error } = await supabase.from('order_history').insert([{
      item_id: targetItem.id,
      item_name: targetItem.name,
      product_code: targetItem.product_code,
      pr_number: manualOrderForm.pr_number.trim(),
      po_number: '-',
      order_qty: Number(manualOrderForm.order_qty),
      received_qty: 0,
      order_date: dateStr,
      month_tag: monthTag,
      status: 'pending',
      lot_number: '-',
      deliveries: JSON.stringify([])
    }]);

    if (!error) {
      setShowManualOrderModal(false);
      setManualOrderForm({
        item_id: '',
        pr_number: '',
        order_qty: 10,
        order_date: todayStr
      });
      fetchData();
      alert('成功手動新增採購下單記錄！');
    } else {
      alert('新增下單失敗：' + error.message);
    }
  };

  const handleUpdateItemField = async (id: string, field: keyof Consumable, currentValue: string | null) => {
    if (!isAdmin) return;
    const fieldNames: Record<string, string> = {
      name: '物料名稱',
      brand: '品牌 (Brand)',
      size: '尺寸 (Size)',
      product_code: 'Product Code'
    };
    const input = prompt(`請輸入新的${fieldNames[field] || field}：`, currentValue || '');
    if (input !== null) {
      await supabase.from('consumables').update({ [field]: input.trim() }).eq('id', id);
      fetchData();
    }
  };

  const handleEditLocation = async (item: Consumable) => {
    if (!isAdmin) return;
    const part1Options = ['OT1', 'OT2', 'OT3', 'OT4', 'OT5', 'OT6', 'PACU', 'Rm610', '其他'];
    const part2Options = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

    const p1 = prompt(`請選擇/輸入 第一部分 (${part1Options.join(', ')})：`, item.location_part1 || 'OT1');
    if (p1 === null) return;
    const p2 = prompt(`請選擇/輸入 第二部分 (${part2Options.join(', ')})：`, item.location_part2 || 'A');
    if (p2 === null) return;
    const free = prompt(`請輸入其他備註 (Free Text)：`, item.location_free || '');
    if (free === null) return;

    await supabase.from('consumables').update({
      location_part1: p1.trim(),
      location_part2: p2.trim(),
      location_free: free.trim()
    }).eq('id', item.id);
    fetchData();
  };

  const handleDirectInputQty = async (item: Consumable) => {
    if (!isAdmin) return;
    const input = prompt(`請輸入「${item.name}」的現存數量 (EA)：`, String(item.current_qty));
    if (input !== null) {
      const qty = parseInt(input, 10);
      if (!isNaN(qty) && qty >= 0) {
        const diff = qty - item.current_qty;
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, current_qty: qty } : i));
        await supabase.from('consumables').update({ current_qty: qty }).eq('id', item.id);
        if (diff !== 0) {
          await supabase.from('inventory_logs').insert([{
            item_id: item.id,
            item_name: item.name,
            old_qty: item.current_qty,
            new_qty: qty,
            changed_qty: diff
          }]);
        }
        fetchData();
      }
    }
  };

  const handleUpdateQty = async (item: Consumable, newQty: number) => {
    const qty = Math.max(0, newQty);
    const diff = qty - item.current_qty;
    if (!isAdmin && diff > 0) {
      alert('普通模式下只能減少現存數量（拎走耗材）。');
      return;
    }
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, current_qty: qty } : i));
    await supabase.from('consumables').update({ current_qty: qty }).eq('id', item.id);
    if (diff !== 0) {
      await supabase.from('inventory_logs').insert([{
        item_id: item.id,
        item_name: item.name,
        old_qty: item.current_qty,
        new_qty: qty,
        changed_qty: diff
      }]);
    }
    fetchData();
  };

  const handleUpdateMinQty = async (id: string, currentMin: number) => {
    if (!isAdmin) return;
    const input = prompt('請輸入新的「最少儲存 (EA)」數量：', String(currentMin));
    if (input !== null) {
      const minQty = parseInt(input, 10);
      if (!isNaN(minQty) && minQty >= 0) {
        await supabase.from('consumables').update({ min_qty: minQty }).eq('id', id);
        fetchData();
      }
    }
  };

  const handleSaveOrder = async (item: Consumable, prNumber: string, orderQty: number, orderDate: string) => {
    if (!isAdmin) return;
    if (!prNumber || !prNumber.trim()) {
      alert('請先輸入 PR 號碼！');
      return;
    }
    if (!orderQty || orderQty <= 0) {
      alert('請輸入有效的下單數量 (EA)！');
      return;
    }
    const dateStr = orderDate || todayStr;
    const monthTag = dateStr.substring(0, 7);

    const { error } = await supabase.from('order_history').insert([{
      item_id: item.id,
      item_name: item.name,
      product_code: item.product_code,
      pr_number: prNumber.trim(),
      po_number: '-',
      order_qty: Number(orderQty),
      received_qty: 0,
      order_date: dateStr,
      month_tag: monthTag,
      status: 'pending',
      lot_number: '-',
      deliveries: JSON.stringify([])
    }]);

    if (!error) {
      setHiddenShortageIds(prev => [...prev, item.id]);
      await fetchData();
      alert('成功建立下單記錄！該項目已從待下單清單中移離。');
    } else {
      alert('儲存失敗：' + error.message);
    }
  };

  const handleEditPoNumber = async (ord: OrderHistory) => {
    if (!isAdmin) return;
    const input = prompt('請輸入/修改此筆採購單的 PO Number：', ord.po_number && ord.po_number !== '-' ? ord.po_number : '');
    if (input === null) return;
    const poNum = input.trim() || '-';
    await supabase.from('order_history').update({ po_number: poNum }).eq('id', ord.id);
    fetchData();
  };

  // 嚴格校驗與多批次送貨/Lot 記錄
  const handleReceiveOrder = async (ord: OrderHistory) => {
    if (!isAdmin) return;
    
    if (!ord.po_number || ord.po_number === '-') {
      alert('⚠️ 請先填寫此張採購單的 PO Number（點擊 PO 欄位填寫）才能進行收貨！');
      return;
    }

    const inputQty = prompt(`請輸入本次返貨數量 (EA) [目前已收: ${ord.received_qty} / 總下單: ${ord.order_qty}]：`, String(ord.order_qty - ord.received_qty));
    if (inputQty === null) return;
    const addQty = parseInt(inputQty, 10);
    if (isNaN(addQty) || addQty <= 0) {
      alert('請輸入有效的數量！');
      return;
    }

    const lotInput = prompt(`請輸入本次返貨的 Lot Number (批號) [必須填寫]：`, '');
    if (lotInput === null) return;
    const lotNum = lotInput.trim();
    if (!lotNum || lotNum === '-') {
      alert('⚠️ 必須輸入有效的 Lot Number (批號) 才能完成收貨！');
      return;
    }

    const dateInput = prompt(`請輸入本次送貨/收貨日期 (YYYY-MM-DD)：`, todayStr);
    if (dateInput === null) return;
    const deliveryDate = dateInput.trim() || todayStr;

    const newReceivedQty = Number(ord.received_qty) + addQty;
    const isCompleted = newReceivedQty >= ord.order_qty;
    const newStatus = isCompleted ? 'completed' : 'pending';

    // 整合現有 deliveries 陣列
    const currentDeliveries: DeliveryBatch[] = Array.isArray(ord.deliveries) ? [...ord.deliveries] : [];
    currentDeliveries.push({
      qty: addQty,
      lot: lotNum,
      date: deliveryDate
    });

    const { error } = await supabase.from('order_history').update({
      received_qty: newReceivedQty,
      lot_number: lotNum, // 保留最新一個方便快速搜尋
      deliveries: JSON.stringify(currentDeliveries),
      status: newStatus
    }).eq('id', ord.id);

    if (error) {
      alert('更新訂單記錄失敗：' + error.message);
      return;
    }

    const targetItem = (items || []).find(i => i.id === ord.item_id);
    if (targetItem) {
      const newQty = targetItem.current_qty + addQty;
      await supabase.from('consumables').update({ 
        current_qty: newQty,
        status: isCompleted ? 'sufficient' : targetItem.status
      }).eq('id', ord.item_id);

      await supabase.from('inventory_logs').insert([{
        item_id: ord.item_id,
        item_name: targetItem.name,
        old_qty: targetItem.current_qty,
        new_qty: newQty,
        changed_qty: addQty
      }]);
    }

    alert(`收貨成功！本次返貨 ${addQty} EA (Lot: ${lotNum}, 日期: ${deliveryDate})。總已收: ${newReceivedQty} / ${ord.order_qty} EA。`);
    fetchData();
  };

  const handleDismissShortageItem = (id: string) => {
    setHiddenShortageIds(prev => [...prev, id]);
  };

  const handleAddBorrow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    const { error } = await supabase.from('borrow_records').insert([borrowForm]);
    if (!error) {
      setShowBorrowModal(false);
      setBorrowForm({ item_name: '', borrow_qty: 1, borrow_date: todayStr, return_due_date: '', pr_number: '', po_number: '', remarks: '' });
      fetchData();
      alert('成功新增借貨記錄！');
    } else {
      alert('新增借貨失敗：' + error.message);
    }
  };

  const handleReturnBorrow = async (borrowRec: BorrowRecord) => {
    if (!isAdmin) return;
    const inputPo = prompt('請輸入此筆還貨對應的 PO Number 才能標記已還貨：', borrowRec.po_number && borrowRec.po_number !== '-' ? borrowRec.po_number : '');
    if (inputPo === null) return;
    const poNum = inputPo.trim();
    if (!poNum) {
      alert('必須填寫 PO Number 才能完成還貨！');
      return;
    }

    const { error } = await supabase.from('borrow_records').update({ 
      status: 'returned',
      po_number: poNum
    }).eq('id', borrowRec.id);

    if (error) {
      alert('更新失敗：' + error.message);
      return;
    }

    fetchData();

    const text = `你好, 我地CMC ANA已經從PO: ${poNum} 扣除之前的借貨, 十分感謝幫忙`;
    navigator.clipboard.writeText(text).then(() => {
      let phoneNum = '';
      const found = salesList.find(s => borrowRec.remarks && s.company_name.toLowerCase().includes(borrowRec.remarks.toLowerCase()));
      if (found) phoneNum = found.phone;

      if (phoneNum) {
        const cleanPhone = phoneNum.replace(/[^0-9]/g, '');
        if (confirm(`【還貨成功！已成功複製 WhatsApp 訊息】\n\n內容：\n${text}\n\n是否立即透過 WhatsApp 聯絡 Sales (${phoneNum})？`)) {
          window.open(`https://wa.me/852${cleanPhone}?text=${encodeURIComponent(text)}`, '_blank');
        }
      } else {
        alert(`【還貨成功！已將以下訊息複製到剪貼簿】\n\n${text}`);
      }
    });
  };

  const handleExportAllInventoryCSV = () => {
    let csvContent = "\uFEFF";
    csvContent += "分類,物品名稱,品牌(Brand),尺寸(Size),Product Code,現存數量(EA),最少儲存(EA),存量狀態,儲存位置,Sales聯絡人,Latex Free\n";

    items.forEach(item => {
      const locStr = `${item.location_part1 || ''}-${item.location_part2 || ''}${item.location_free ? ` (${item.location_free})` : ''}`;
      const statusStr = item.status === 'out_of_stock' ? '已缺貨' : isWarningStatus(item.status) ? '60天內到期' : '足夠';
      const latexStr = item.is_latex_free ? 'Yes' : 'No';

      csvContent += `"${item.category}","${item.name}","${item.brand || ''}","${item.size || ''}","${item.product_code || ''}",${item.current_qty},${item.min_qty},"${statusStr}","${locStr}","${item.sales_contact || ''}","${latexStr}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Anaesthesia_All_Inventory_Export_${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    (orders || []).forEach(o => {
      const yr = o.month_tag ? o.month_tag.substring(0, 4) : (o.order_date ? o.order_date.substring(0, 4) : '2026');
      years.add(yr);
    });
    if (years.size === 0) years.add('2026');
    return Array.from(years).sort().reverse();
  }, [orders]);

  const filteredAnnualPurchaseStats = useMemo(() => {
    const map = new Map<string, { name: string; size: string; code: string; totalOrdered: number; totalReceived: number; count: number }>();
    (orders || []).forEach(o => {
      const monthTag = o.month_tag || (o.order_date ? o.order_date.substring(0, 7) : '');
      const yr = monthTag.substring(0, 4);
      const mo = monthTag.substring(5, 7);

      const matchesYear = statsYearFilter === 'All' || yr === statsYearFilter;
      const matchesMonth = statsMonthFilter === 'All' || mo === statsMonthFilter;

      if (matchesYear && matchesMonth && o.status === 'completed') {
        const key = `${o.item_id}-${o.item_size || '標準'}`;
        if (!map.has(key)) {
          map.set(key, {
            name: o.item_name || '未命名',
            size: o.item_size || '標準',
            code: o.product_code || '-',
            totalOrdered: 0,
            totalReceived: 0,
            count: 0
          });
        }
        const itemStat = map.get(key)!;
        itemStat.totalOrdered += Number(o.order_qty || 0);
        itemStat.totalReceived += Number(o.received_qty || 0);
        itemStat.count += 1;
      }
    });
    return Array.from(map.values()).sort((a, b) => b.totalReceived - a.totalReceived);
  }, [orders, statsYearFilter, statsMonthFilter]);

  const handleExportCSV = () => {
    let csvContent = "\uFEFF";
    csvContent += "物品名稱,Size,Product Code,已完成下單次數,總下單量(EA),已收貨量(EA)\n";
    filteredAnnualPurchaseStats.forEach(stat => {
      csvContent += `"${stat.name}","${stat.size}","${stat.code}",${stat.count},${stat.totalOrdered},${stat.totalReceived}\n`;
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Anaesthesia_Consumables_Stats_${statsYearFilter}_${statsMonthFilter}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const combinedSalesList = useMemo(() => {
    const map = new Map<string, SalesContact>();
    (salesList || []).forEach(s => {
      if (s && s.sales_name && s.phone) {
        const key = `${s.sales_name.toLowerCase()}-${s.phone.replace(/[^0-9]/g, '')}`;
        map.set(key, { ...s, is_auto: false });
      }
    });

    const autoGroup = new Map<string, { sales_name: string; phone: string; brands: Set<string>; itemNames: string[] }>();
    (items || []).forEach(item => {
      const raw = (item.sales_contact || '').trim();
      if (!raw || raw === '-' || raw.includes('大倉')) return;
      const phoneMatch = raw.match(/(\d{8})/);
      const phone = phoneMatch ? phoneMatch[1] : '';
      const namePart = raw.replace(/(\d{8})/, '').replace(/[-:/()]/g, '').trim() || raw;
      const key = `${namePart.toLowerCase()}-${phone}`;

      if (!autoGroup.has(key)) {
        autoGroup.set(key, { sales_name: namePart, phone: phone, brands: new Set(), itemNames: [] });
      }
      const group = autoGroup.get(key)!;
      if (item.brand && item.brand.trim()) group.brands.add(item.brand.trim());
      group.itemNames.push(item.name);
    });

    autoGroup.forEach((val, key) => {
      if (!map.has(key)) {
        const brandStr = Array.from(val.brands).slice(0, 4).join(', ') || '未標註品牌';
        const sampleItems = val.itemNames.slice(0, 3).join(', ');
        map.set(key, {
          id: `auto-${key}`,
          company_name: brandStr,
          sales_name: val.sales_name,
          phone: val.phone,
          email: null,
          remarks: `負責 ${val.itemNames.length} 款耗材 (${sampleItems}${val.itemNames.length > 3 ? '...' : ''})`,
          is_auto: true
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.sales_name.localeCompare(b.sales_name));
  }, [salesList, items]);

  const handleSyncAutoSalesToDB = async () => {
    if (!isAdmin) return;
    const autoOnes = combinedSalesList.filter(s => s.is_auto);
    if (autoOnes.length === 0) {
      alert('所有聯絡人已經同步在資料庫中！');
      return;
    }
    setSyncingSales(true);
    const payload = autoOnes.map(s => ({
      company_name: s.company_name,
      sales_name: s.sales_name,
      phone: s.phone,
      email: '',
      remarks: s.remarks
    }));
    const { error } = await supabase.from('sales_contacts').insert(payload);
    setSyncingSales(false);
    if (!error) {
      fetchData();
      alert(`成功將 ${payload.length} 位 Sales 聯絡人永久儲存至資料庫！`);
    } else {
      alert('同步失敗：' + error.message);
    }
  };

  const handleAddSales = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    const { error } = await supabase.from('sales_contacts').insert([salesForm]);
    if (!error) {
      setShowAddSalesModal(false);
      setSalesForm({ company_name: '', sales_name: '', phone: '', email: '', remarks: '' });
      fetchData();
    } else {
      alert(error.message);
    }
  };

  const handleUpdateSales = async (salesRecord: SalesContact) => {
    if (!isAdmin) return;
    let targetId = salesRecord.id;

    if (salesRecord.is_auto || targetId.startsWith('auto-')) {
      const { data: newRec, error: insertErr } = await supabase
        .from('sales_contacts')
        .insert([{
          company_name: editSalesForm.company_name,
          sales_name: editSalesForm.sales_name,
          phone: editSalesForm.phone,
          email: editSalesForm.email,
          remarks: editSalesForm.remarks
        }])
        .select()
        .single();

      if (insertErr) {
        alert('自動寫入資料庫失敗：' + insertErr.message);
        return;
      }
      if (newRec) targetId = newRec.id;
    } else {
      await supabase.from('sales_contacts').update(editSalesForm).eq('id', targetId);
    }

    const brandKeyword = editSalesForm.company_name.trim();
    if (brandKeyword) {
      const newContactString = `${editSalesForm.sales_name} ${editSalesForm.phone}`;
      const matchingItems = items.filter(i => i.brand && i.brand.toLowerCase().includes(brandKeyword.toLowerCase()));
      for (const item of matchingItems) {
        await supabase.from('consumables').update({ sales_contact: newContactString }).eq('id', item.id);
      }
    }

    setEditingSalesId(null);
    fetchData();
    alert('更新 Sales 成功！並已自動同步更新所有對應品牌耗材細頁的聯絡資料。');
  };

  const handleDeleteSales = async (id: string, name: string, isAuto?: boolean) => {
    if (!isAdmin) return;
    if (isAuto) {
      alert('此聯絡人由耗材清單自動提取。');
      return;
    }
    if (confirm(`確定要刪除聯絡人：${name}？`)) {
      await supabase.from('sales_contacts').delete().eq('id', id);
      fetchData();
    }
  };

  const aiPredictions = useMemo(() => {
    return (items || []).map(item => {
      const itemLogs = (logs || []).filter(l => l.item_id === item.id && l.changed_qty < 0);
      const totalConsumed = itemLogs.reduce((sum, l) => sum + Math.abs(l.changed_qty), 0);
      const dailyConsumption = totalConsumed > 0 ? Number((totalConsumed / 30).toFixed(2)) : 0.2; 
      const daysLeft = dailyConsumption > 0 ? Math.floor(item.current_qty / dailyConsumption) : 999;
      let urgency = 'safe';
      if (daysLeft <= 0 || item.status === 'out_of_stock') urgency = 'danger';
      else if (daysLeft <= 60 || isWarningStatus(item.status)) urgency = 'warning';
      return { ...item, totalConsumed, dailyConsumption, daysLeft, urgency };
    }).sort((a, b) => a.daysLeft - b.daysLeft);
  }, [items, logs]);

  const availableOrderMonths = useMemo(() => {
    const months = new Set<string>();
    (orders || []).forEach(o => {
      if (o.month_tag) months.add(o.month_tag);
      else if (o.order_date) months.add(o.order_date.substring(0, 7));
    });
    return Array.from(months).sort().reverse();
  }, [orders]);

  const outOfStockItemsList = useMemo(() => (items || []).filter(i => i.status === 'out_of_stock'), [items]);
  const warning60dItemsList = useMemo(() => (items || []).filter(i => isWarningStatus(i.status)), [items]);

  const outOfStockCount = outOfStockItemsList.length;
  const warningCount = warning60dItemsList.length;
  const activeBorrowsCount = (borrows || []).filter(b => b.status === 'borrowed').length;

  const isShowingItemList = Boolean(search.trim()) || selectedCategory !== null || statusFilter !== 'all';

  const filteredItems = (items || []).filter(item => {
    const matchesCat = statusFilter !== 'all' 
      ? true 
      : (!selectedCategory || selectedCategory === 'All' || item.category === selectedCategory);
    const locFull = `${item.location_part1 || ''}-${item.location_part2 || ''}-${item.location_free || ''}`.toLowerCase();
    const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase()) || 
                          (item.brand && item.brand.toLowerCase().includes(search.toLowerCase())) ||
                          (item.product_code && item.product_code.toLowerCase().includes(search.toLowerCase())) ||
                          locFull.includes(search.toLowerCase());
    
    let matchesStatus = true;
    if (statusFilter === 'out_of_stock') matchesStatus = item.status === 'out_of_stock';
    if (statusFilter === 'warning_60d') matchesStatus = isWarningStatus(item.status);

    return matchesCat && matchesSearch && matchesStatus;
  }).sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'accent' }));

  const filteredSales = combinedSalesList.filter(sales => 
    sales.company_name.toLowerCase().includes(salesSearch.toLowerCase()) ||
    sales.sales_name.toLowerCase().includes(salesSearch.toLowerCase()) ||
    sales.phone.includes(salesSearch) ||
    (sales.remarks && sales.remarks.toLowerCase().includes(salesSearch.toLowerCase()))
  );

  const shortageItems = (items || []).filter(i => (i.status === 'out_of_stock' || isWarningStatus(i.status)) && !hiddenShortageIds.includes(i.id));

  const pendingOrdersList = useMemo(() => {
    return (orders || []).filter(o => {
      const matchesMonth = selectedOrderMonth === 'All' || o.month_tag === selectedOrderMonth;
      return matchesMonth && o.status !== 'completed';
    });
  }, [orders, selectedOrderMonth]);

  const archivedOrdersList = useMemo(() => {
    return (orders || []).filter(o => {
      if (o.status !== 'completed') return false;
      const query = archiveSearch.trim().toLowerCase();
      if (!query) return true;
      const matchPr = (o.pr_number || '').toLowerCase().includes(query);
      const matchPo = (o.po_number || '').toLowerCase().includes(query);
      const matchLot = (o.lot_number || '').toLowerCase().includes(query);
      const matchName = (o.item_name || '').toLowerCase().includes(query);
      return matchPr || matchPo || matchLot || matchName;
    });
  }, [orders, archiveSearch]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="bg-white border-b sticky top-0 z-20 px-4 py-3 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div 
            onClick={() => { setActiveTab('inventory'); setSelectedCategory(null); setStatusFilter('all'); setSearch(''); }}
            className="cursor-pointer flex items-center gap-3"
          >
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Anaesthesia Consumables</h1>
              <p className="text-xs text-slate-500">庫存、採購、借貨與 AI 智能管理系統</p>
            </div>
            {isAdmin ? (
              <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 border border-emerald-300">
                <Unlock size={10} /> 管理員模式已解鎖
              </span>
            ) : (
              <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium flex items-center gap-1 border border-slate-200">
                <Lock size={10} /> 普通模式 (僅可點擊減數)
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => { setActiveTab('inventory'); setSelectedCategory(null); setStatusFilter('all'); }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition ${
                activeTab === 'inventory' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Layers size={16} /> 庫存分類總覽
            </button>

            {isAdmin && (
              <>
                <button
                  onClick={() => setActiveTab('ai_predict')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition ${
                    activeTab === 'ai_predict' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Sparkles size={16} /> AI 預測
                </button>
                <button
                  onClick={() => setActiveTab('orders')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition ${
                    activeTab === 'orders' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <ClipboardList size={16} /> 採購與收貨追蹤
                  {(outOfStockCount + warningCount > 0) && (
                    <span className="ml-1 px-1.5 py-0.5 text-xs bg-red-500 text-white rounded-full">
                      {outOfStockCount + warningCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('borrow')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition ${
                    activeTab === 'borrow' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <HandHelping size={16} /> 借貨與還貨管理
                  {activeBorrowsCount > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 text-xs bg-amber-500 text-white rounded-full">
                      {activeBorrowsCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('sales')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition ${
                    activeTab === 'sales' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Users size={16} /> Sales 通訊錄
                </button>
              </>
            )}

            <button
              onClick={handleAdminLogin}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-bold transition ${
                isAdmin ? 'bg-rose-600 text-white hover:bg-rose-700' : 'bg-slate-800 text-white hover:bg-slate-900'
              }`}
            >
              {isAdmin ? <Lock size={15} /> : <Unlock size={15} />}
              {isAdmin ? '退出管理員' : '管理員登入'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        {activeTab === 'inventory' && (
          <section className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div
                onClick={() => { setStatusFilter('out_of_stock'); setSelectedCategory('All'); }}
                className={`cursor-pointer border rounded-2xl p-4 flex items-center justify-between transition shadow-sm ${
                  statusFilter === 'out_of_stock' ? 'bg-red-100 border-red-400 ring-2 ring-red-400' : 'bg-red-50 border-red-200 hover:bg-red-100/60'
                }`}
              >
                <div>
                  <p className="text-xs font-bold text-red-600 uppercase tracking-wider">已缺貨物料</p>
                  <p className="text-3xl font-extrabold text-red-700 mt-1">{outOfStockCount} 件</p>
                  <p className="text-[11px] text-red-500 mt-1">點擊展開完整缺貨清單進行處理 ➔</p>
                </div>
                <div className="p-3 bg-red-100 rounded-xl text-red-600">
                  <AlertTriangle size={28} />
                </div>
              </div>

              <div
                onClick={() => { setStatusFilter('warning_60d'); setSelectedCategory('All'); }}
                className={`cursor-pointer border rounded-2xl p-4 flex items-center justify-between transition shadow-sm ${
                  statusFilter === 'warning_60d' ? 'bg-amber-100 border-amber-400 ring-2 ring-amber-400' : 'bg-amber-50 border-amber-200 hover:bg-amber-100/60'
                }`}
              >
                <div>
                  <p className="text-xs font-bold text-amber-600 uppercase tracking-wider">60天內到期 / 預警物料</p>
                  <p className="text-3xl font-extrabold text-amber-700 mt-1">{warningCount} 件</p>
                  <p className="text-[11px] text-amber-500 mt-1">點擊展開 60 天預警清單 ➔</p>
                </div>
                <div className="p-3 bg-amber-100 rounded-xl text-amber-600">
                  <AlertCircle size={28} />
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
              <div className="flex items-center gap-2 flex-1">
                {isShowingItemList && (
                  <button
                    onClick={() => { setSelectedCategory(null); setStatusFilter('all'); setSearch(''); }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 transition shrink-0"
                  >
                    <ArrowLeft size={15} /> 返回分類目錄
                  </button>
                )}
                <div className="relative flex items-center w-full sm:w-96 gap-2">
                  <div className="relative flex-1">
                    <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="跨分類搜尋物品 / Brand / Code / 位置..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <button
                    onClick={startCamera}
                    className="flex items-center gap-1 px-3 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg text-xs font-semibold hover:bg-indigo-100 transition shrink-0"
                    title="啟動相機鏡頭實時掃描條碼"
                  >
                    <Camera size={16} /> 掃描條碼
                  </button>
                </div>
              </div>

              {isAdmin && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExportAllInventoryCSV}
                    className="flex items-center gap-1.5 bg-emerald-600 text-white px-3.5 py-2 rounded-lg text-xs font-semibold hover:bg-emerald-700 transition"
                    title="一鍵將所有庫存卡片匯出成 Excel"
                  >
                    <Download size={15} /> 匯出全部庫存
                  </button>
                  <button
                    onClick={handleCreateNewCategory}
                    className="flex items-center gap-1 bg-indigo-50 border border-indigo-200 text-indigo-700 px-3.5 py-2 rounded-lg text-xs font-semibold hover:bg-indigo-100 transition"
                  >
                    <FolderPlus size={15} /> + 新增分類
                  </button>
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="flex items-center gap-1.5 bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-semibold hover:bg-indigo-700 transition"
                  >
                    <Plus size={15} /> 新增物品
                  </button>
                </div>
              )}
            </div>

            {!isShowingItemList && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-700">請選擇耗材分類（共 {allCategories.length} 個分類，已按 A-Z 排列）</h2>
                  <button
                    onClick={() => { setSelectedCategory('All'); setStatusFilter('all'); }}
                    className="text-xs font-semibold text-indigo-600 hover:underline"
                  >
                    查看全部物品 ({(items || []).length})
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {allCategories.map(cat => {
                    const catItems = (items || []).filter(i => i.category === cat);
                    return (
                      <div
                        key={cat}
                        onClick={() => { setSelectedCategory(cat); setStatusFilter('all'); }}
                        className="cursor-pointer group bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:border-indigo-400 transition flex flex-col justify-between space-y-4"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition">
                            <Folder size={22} />
                          </div>
                          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                            {catItems.length} 件物品
                          </span>
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition">{cat}</h3>
                          <p className="text-xs text-slate-400 mt-0.5">點擊進入查看及管理此分類</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {isShowingItemList && (
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-slate-100 p-3 rounded-xl">
                  <span className="text-xs font-bold text-slate-700">
                    目前檢視清單：{statusFilter !== 'all' ? '跨分類狀態篩選' : (selectedCategory === 'All' ? '全部分類' : selectedCategory)} {statusFilter === 'out_of_stock' ? '【僅顯示：已缺貨】' : statusFilter === 'warning_60d' ? '【僅顯示：60天內到期】' : ''} (共 {filteredItems.length} 件)
                  </span>
                  <div className="flex items-center gap-3">
                    {statusFilter !== 'all' && (
                      <button
                        onClick={() => setStatusFilter('all')}
                        className="text-xs font-bold text-amber-700 hover:underline"
                      >
                        清除狀態過濾
                      </button>
                    )}
                    <button
                      onClick={() => { setSelectedCategory(null); setStatusFilter('all'); }}
                      className="text-xs font-bold text-indigo-600 hover:underline"
                    >
                      返回分類主頁
                    </button>
                  </div>
                </div>

                {filteredItems.length === 0 ? (
                  <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-400 text-sm">
                    目前沒有符合此條件的耗材項目
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredItems.map(item => {
                      const locDisplay = `${item.location_part1 || ''}-${item.location_part2 || ''}${item.location_free ? ` (${item.location_free})` : ''}`;
                      const normalizedSelectStatus = isWarningStatus(item.status) ? 'warning_60d' : item.status;

                      return (
                        <div key={item.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col justify-between space-y-3 relative">
                          
                          {/* 右上角 LATEX FREE 標籤按鈕 */}
                          <div className="absolute top-4 right-4">
                            <span 
                              onClick={() => handleToggleLatexFree(item)}
                              className={`text-[10px] font-bold px-2 py-1 rounded-md border flex items-center gap-1 transition select-none ${
                                item.is_latex_free 
                                  ? 'bg-teal-50 text-teal-700 border-teal-300 shadow-xs' + (isAdmin ? ' cursor-pointer hover:bg-teal-100' : '')
                                  : 'bg-slate-100 text-slate-400 border-slate-200' + (isAdmin ? ' cursor-pointer hover:bg-slate-200 hover:text-slate-600' : '')
                              }`}
                              title={isAdmin ? "管理員點擊切換 Latex Free 標記" : "此物品的乳膠成份標記"}
                            >
                              <ShieldCheck size={12} className={item.is_latex_free ? 'text-teal-600' : 'text-slate-400'} />
                              {item.is_latex_free ? 'LATEX FREE' : 'LATEX'}
                            </span>
                          </div>

                          <div>
                            <div className="flex items-center gap-2 mb-1 pr-24">
                              {isAdmin ? (
                                <select
                                  value={item.category}
                                  onChange={(e) => handleCategoryChange(item, e.target.value)}
                                  className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded cursor-pointer focus:outline-none"
                                >
                                  {allCategories.map(c => (
                                    <option key={c} value={c}>{c}</option>
                                  ))}
                                </select>
                              ) : (
                                <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                                  {item.category}
                                </span>
                              )}
                            </div>

                            <h3 
                              onClick={() => handleUpdateItemField(item.id, 'name', item.name)}
                              className={`text-base font-semibold text-slate-900 ${isAdmin ? 'cursor-pointer hover:text-indigo-600 hover:underline' : ''}`}
                            >
                              {item.name}
                            </h3>
                            <div className="flex items-center justify-between text-xs text-slate-500 mt-0.5">
                              <span 
                                onClick={() => handleUpdateItemField(item.id, 'brand', item.brand)}
                                className={isAdmin ? 'cursor-pointer hover:text-indigo-600 hover:underline font-bold text-slate-700' : 'font-bold text-slate-700'}
                              >
                                {item.brand || '無品牌'}
                              </span>
                              <span>·</span>
                              <span 
                                onClick={() => handleUpdateItemField(item.id, 'size', item.size)}
                                className={isAdmin ? 'cursor-pointer hover:text-indigo-600 hover:underline' : ''}
                              >
                                Size: <strong className="text-indigo-600">{item.size || '標準'}</strong>
                              </span>
                            </div>
                          </div>

                          <div className="text-xs space-y-1.5 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                            <div 
                              onClick={() => handleUpdateItemField(item.id, 'product_code', item.product_code)}
                              className={`flex items-center justify-between ${isAdmin ? 'cursor-pointer hover:text-indigo-600' : ''}`}
                            >
                              <div><span className="text-slate-400">Product Code:</span> <span className="font-mono font-medium text-slate-800">{item.product_code || '-'}</span></div>
                              {isAdmin && <Edit3 size={11} className="text-indigo-500" />}
                            </div>

                            <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                              <div>
                                <span className="text-slate-400">Sales:</span> <span className="text-slate-800 font-medium">{item.sales_contact || '-'}</span>
                              </div>
                              {isAdmin && (
                                <button
                                  onClick={() => handleCardUpdateSales(item)}
                                  className="text-[11px] text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2 py-0.5 rounded flex items-center gap-1 font-semibold transition"
                                  title="修改此 Sales 聯絡資料並自動同步全院同品牌"
                                >
                                  <Edit3 size={10} /> 修改 Sales
                                </button>
                              )}
                            </div>

                            <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                              <span 
                                onClick={() => handleEditLocation(item)}
                                className={`text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1 ${isAdmin ? 'cursor-pointer hover:bg-emerald-100' : ''}`}
                                title={isAdmin ? "管理員點擊修改儲存位置" : ""}
                              >
                                <MapPin size={10} /> {locDisplay} {isAdmin && <Edit3 size={9} className="ml-0.5 text-emerald-600" />}
                              </span>

                              <div 
                                onClick={() => handleUpdateMinQty(item.id, item.min_qty)}
                                className={`group flex items-center gap-1 text-slate-500 ${isAdmin ? 'cursor-pointer hover:text-indigo-600' : ''}`}
                              >
                                <span>Min: <strong className="text-slate-800 font-mono">{item.min_qty}</strong></span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between pt-1">
                              <span className="text-slate-600 font-medium">現存數量:</span>
                              <div className="flex items-center gap-1.5">
                                <button 
                                  onClick={() => handleUpdateQty(item, item.current_qty - 1)}
                                  className="w-6 h-6 bg-rose-100 hover:bg-rose-200 text-rose-800 rounded font-bold flex items-center justify-center text-sm shadow-xs"
                                >-</button>
                                <strong 
                                  onClick={() => handleDirectInputQty(item)}
                                  className={`text-slate-900 font-mono text-sm px-2 py-0.5 rounded ${isAdmin ? 'cursor-pointer bg-indigo-50 text-indigo-700 hover:bg-indigo-100 ring-1 ring-indigo-200' : ''}`}
                                  title={isAdmin ? "管理員點擊直接輸入數量" : ""}
                                >
                                  {item.current_qty} EA
                                </strong>
                                {isAdmin && (
                                  <button 
                                    onClick={() => handleUpdateQty(item, item.current_qty + 1)}
                                    className="w-6 h-6 bg-indigo-100 hover:bg-indigo-200 text-indigo-800 rounded font-bold flex items-center justify-center text-sm shadow-xs"
                                  >+</button>
                                )}
                              </div>
                            </div>
                          </div>

                          <div>
                            <label className="text-[11px] font-medium text-slate-500 mb-1 block">存量狀態</label>
                            {isAdmin ? (
                              <select
                                value={normalizedSelectStatus}
                                onChange={(e) => handleStatusChange(item, e.target.value)}
                                className={`w-full text-xs font-semibold px-2.5 py-1.5 rounded-lg border cursor-pointer focus:outline-none ${
                                  item.status === 'out_of_stock'
                                    ? 'bg-red-50 text-red-700 border-red-200'
                                    : isWarningStatus(item.status)
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                }`}
                              >
                                <option value="sufficient">足夠</option>
                                <option value="warning_60d">60天內到期</option>
                                <option value="out_of_stock">已缺貨</option>
                              </select>
                            ) : (
                              <div className={`w-full text-xs font-semibold px-2.5 py-1.5 rounded-lg border text-center ${
                                item.status === 'out_of_stock'
                                  ? 'bg-red-50 text-red-700 border-red-200'
                                  : isWarningStatus(item.status)
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              }`}>
                                {item.status === 'out_of_stock' ? '已缺貨' : isWarningStatus(item.status) ? '60天內到期' : '足夠'}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* AI 預測分頁 */}
        {activeTab === 'ai_predict' && isAdmin && (
          <section className="space-y-4">
            <div className="bg-indigo-900 text-white p-6 rounded-2xl shadow-md space-y-2">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Sparkles className="text-amber-400" size={20} /> AI 智能消耗與 60 天預測引擎
              </h2>
              <p className="text-xs text-indigo-200">
                系統會自動追蹤每次點數扣減（EA），利用動態模型計算每件物品的「日均消耗量」與「剩餘可用天數」，並在 60 天內耗盡時自動標註預警。
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs border-b">
                  <tr>
                    <th className="p-3">預警級別</th>
                    <th className="p-3">分類</th>
                    <th className="p-3">物品名稱 (Size)</th>
                    <th className="p-3">現存數量</th>
                    <th className="p-3">日均消耗量 (EA/日)</th>
                    <th className="p-3">預計可用天數</th>
                    <th className="p-3">AI 建議</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {aiPredictions.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50/50">
                      <td className="p-3 whitespace-nowrap">
                        {item.urgency === 'danger' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 flex items-center gap-1 w-fit">
                            <AlertTriangle size={12} /> 已缺貨
                          </span>
                        )}
                        {item.urgency === 'warning' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 flex items-center gap-1 w-fit">
                            <AlertCircle size={12} /> 60天內到期 (≤60日)
                          </span>
                        )}
                        {item.urgency === 'safe' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 flex items-center gap-1 w-fit">
                            <CheckCircle2 size={12} /> 足夠
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-slate-500">{item.category}</td>
                      <td className="p-3 font-semibold text-slate-800">{item.name} <span className="text-indigo-600 font-bold">({item.size || '標準'})</span></td>
                      <td className="p-3 font-mono font-bold text-slate-900">{item.current_qty} EA</td>
                      <td className="p-3 font-mono text-indigo-600 font-semibold">{item.dailyConsumption} EA/日</td>
                      <td className="p-3 font-mono font-bold">
                        <span className={item.daysLeft <= 60 ? 'text-amber-600 font-bold' : 'text-slate-700'}>
                          {item.daysLeft > 360 ? '999+ 日' : `${item.daysLeft} 日`}
                        </span>
                      </td>
                      <td className="p-3 text-slate-600">
                        {item.daysLeft <= 0 ? (
                          <span className="text-red-700 font-bold">💡 建議立即發出 PR 採購單！</span>
                        ) : item.daysLeft <= 60 ? (
                          <span className="text-amber-700 font-medium">💡 60天內即將用盡，建議提前安排補貨</span>
                        ) : (
                          <span className="text-slate-400">暫無需特別跟進</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* 採購與收貨追蹤分頁 */}
        {activeTab === 'orders' && isAdmin && (
          <section className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-amber-50 border border-amber-200 p-4 rounded-xl">
              <div className="text-xs text-amber-800 space-y-1">
                <p className="font-bold text-amber-900 text-sm flex items-center gap-1.5">
                  <Calendar size={16} /> 採購單與月度收貨跟進 (單位: EA)
                </p>
                <p>在此填寫 PR、下單數量與日期並儲存。支援手動隨時新增下單項目。收貨時必須填妥 PO、數量與 Lot Number 才能完成。</p>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={() => setShowManualOrderModal(true)}
                  className="flex items-center gap-1 bg-indigo-600 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold hover:bg-indigo-700 transition"
                >
                  <Plus size={14} /> + 手動新增下單
                </button>

                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  <button
                    onClick={() => setSelectedOrderMonth('All')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                      selectedOrderMonth === 'All' ? 'bg-amber-600 text-white' : 'bg-white border text-amber-900 hover:bg-amber-100'
                    }`}
                  >
                    全部月份
                  </button>
                  {availableOrderMonths.map(m => (
                    <button
                      key={m}
                      onClick={() => setSelectedOrderMonth(m)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                        selectedOrderMonth === m ? 'bg-amber-600 text-white' : 'bg-white border text-amber-900 hover:bg-amber-100'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto shadow-sm p-4 space-y-3">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <ClipboardList size={16} className="text-indigo-600" /> 1. 系統預警缺貨物料下單區
              </h3>
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs border-b">
                  <tr>
                    <th className="p-3">狀態</th>
                    <th className="p-3">物品名稱 (Size)</th>
                    <th className="p-3">Product Code</th>
                    <th className="p-3">PR Number</th>
                    <th className="p-3">下單數量 (EA)</th>
                    <th className="p-3">下單日期</th>
                    <th className="p-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {shortageItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-slate-400">目前沒有系統預警需要下單的物料（可點上方「+ 手動新增下單」按鈕隨時新增）</td>
                    </tr>
                  ) : (
                    shortageItems.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50/50">
                        <td className="p-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            item.status === 'out_of_stock' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {item.status === 'out_of_stock' ? '已缺貨' : '60天內到期'}
                          </span>
                        </td>
                        <td className="p-3 font-semibold text-slate-800">
                          {item.name} <span className="text-indigo-600 font-bold">({item.size || '標準'})</span>
                        </td>
                        <td className="p-3 font-mono text-slate-600">{item.product_code || '-'}</td>
                        <td className="p-3">
                          <input type="text" placeholder="輸入 PR 號碼" id={`pr-${item.id}`} className="w-28 px-2 py-1 border rounded font-mono text-xs" />
                        </td>
                        <td className="p-3">
                          <input type="number" defaultValue="10" id={`qty-${item.id}`} className="w-20 px-2 py-1 border rounded font-mono text-xs" />
                        </td>
                        <td className="p-3">
                          <input type="date" defaultValue={todayStr} id={`date-${item.id}`} className="px-2 py-1 border rounded text-xs" />
                        </td>
                        <td className="p-3 text-right flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleCallSalesAction(item)}
                            className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 text-white rounded text-xs font-semibold hover:bg-emerald-700 transition"
                            title="一秒生成 WhatsApp 報價範本並複製"
                          >
                            <PhoneCall size={13} /> CALL SALES
                          </button>

                          <button
                            onClick={() => {
                              const pr = (document.getElementById(`pr-${item.id}`) as HTMLInputElement)?.value;
                              const qty = Number((document.getElementById(`qty-${item.id}`) as HTMLInputElement)?.value);
                              const dt = (document.getElementById(`date-${item.id}`) as HTMLInputElement)?.value;
                              handleSaveOrder(item, pr, qty, dt);
                            }}
                            className="px-3 py-1 bg-indigo-600 text-white rounded text-xs font-semibold hover:bg-indigo-700"
                          >
                            儲存下單
                          </button>
                          <button
                            onClick={() => handleDismissShortageItem(item.id)}
                            className="p-1 text-slate-400 hover:text-red-600 transition"
                            title="從此清單移除"
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto shadow-sm p-4 space-y-3">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <PackageCheck size={16} className="text-emerald-600" /> 2. 進行中採購單與收貨跟進（支援多批次送貨與不同 Lot 記錄）
              </h3>
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs border-b">
                  <tr>
                    <th className="p-3">月份</th>
                    <th className="p-3">PR 號碼</th>
                    <th className="p-3">PO 號碼</th>
                    <th className="p-3">物品名稱 (Size)</th>
                    <th className="p-3">下單數量</th>
                    <th className="p-3">已收數量 / 分批送貨明細 (Lot & 日期)</th>
                    <th className="p-3">狀態</th>
                    <th className="p-3 text-right">操作 (收貨與PO)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {pendingOrdersList.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-slate-400">目前沒有進行中的採購單</td>
                    </tr>
                  ) : (
                    pendingOrdersList.map(ord => (
                      <tr key={ord.id} className="hover:bg-slate-50/50">
                        <td className="p-3 font-mono font-bold text-indigo-600">{ord.month_tag}</td>
                        <td className="p-3 font-mono font-semibold">{ord.pr_number}</td>
                        <td className="p-3 font-mono">
                          <span 
                            onClick={() => handleEditPoNumber(ord)}
                            className="cursor-pointer text-indigo-600 hover:underline bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 font-semibold"
                            title="點擊輸入或修改 PO Number"
                          >
                            {ord.po_number && ord.po_number !== '-' ? ord.po_number : '+ 填寫 PO'}
                          </span>
                        </td>
                        <td className="p-3 font-semibold text-slate-800">
                          {ord.item_name} <span className="text-indigo-600 font-bold">({ord.item_size || '標準'})</span>
                        </td>
                        <td className="p-3 font-mono">{ord.order_qty} EA</td>
                        <td className="p-3 font-mono space-y-1">
                          <div><strong className="text-emerald-700">{ord.received_qty} EA</strong> / 總下單: {ord.order_qty} EA</div>
                          {ord.deliveries && ord.deliveries.length > 0 && (
                            <div className="text-[11px] text-slate-500 space-y-0.5 mt-1 border-t pt-1 border-slate-100">
                              {ord.deliveries.map((d, i) => (
                                <div key={i} className="bg-slate-100 px-1.5 py-0.5 rounded">
                                  📦 <strong>{d.qty} EA</strong> | Lot: <span className="text-slate-800 font-bold">{d.lot}</span> | 日期: {d.date}
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded font-bold">分批收貨中 (Pending)</span>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => handleReceiveOrder(ord)}
                            className="px-3 py-1 bg-emerald-600 text-white rounded text-xs font-semibold hover:bg-emerald-700"
                          >
                            + 記錄返貨與批號
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* 3. 已完成採購歷史檔案夾 (Archive) 兼 批號追溯搜尋器 */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto shadow-sm p-4 space-y-3">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <Archive size={16} className="text-indigo-600" /> 3. 已完成採購歷史檔案夾 (Archive & 批號追溯)
                </h3>
                <div className="relative w-full sm:w-72">
                  <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="輸入 Lot No. / PO / PR 快速追溯..."
                    value={archiveSearch}
                    onChange={e => setArchiveSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 border rounded-lg text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs border-b">
                  <tr>
                    <th className="p-3">月份</th>
                    <th className="p-3">PR 號碼</th>
                    <th className="p-3">PO 號碼</th>
                    <th className="p-3">物品名稱 (Size)</th>
                    <th className="p-3">下單數量</th>
                    <th className="p-3">已收數量 / 分批送貨明細 (Lot & 日期)</th>
                    <th className="p-3">狀態</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {archivedOrdersList.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-slate-400">
                        {archiveSearch ? '找不到符合該 Lot No. / PO / PR 的歷史訂單' : '暫無已完成收貨的歷史檔案'}
                      </td>
                    </tr>
                  ) : (
                    archivedOrdersList.map(ord => (
                      <tr key={ord.id} className="hover:bg-slate-50/50">
                        <td className="p-3 font-mono font-bold text-indigo-600">{ord.month_tag}</td>
                        <td className="p-3 font-mono font-semibold">{ord.pr_number}</td>
                        <td className="p-3 font-mono text-indigo-700 font-semibold">{ord.po_number || '-'}</td>
                        <td className="p-3 font-semibold text-slate-800">
                          {ord.item_name} <span className="text-indigo-600 font-bold">({ord.item_size || '標準'})</span>
                        </td>
                        <td className="p-3 font-mono">{ord.order_qty} EA</td>
                        <td className="p-3 font-mono space-y-1">
                          <div><strong className="text-emerald-700">{ord.received_qty} EA</strong> / 總下單: {ord.order_qty} EA</div>
                          {ord.deliveries && ord.deliveries.length > 0 && (
                            <div className="text-[11px] text-slate-500 space-y-0.5 mt-1 border-t pt-1 border-slate-100">
                              {ord.deliveries.map((d, i) => (
                                <div key={i} className="bg-slate-100 px-1.5 py-0.5 rounded">
                                  📦 <strong>{d.qty} EA</strong> | Lot: <span className="text-slate-800 font-bold">{d.lot}</span> | 日期: {d.date}
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold">已收貨完成</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* 4. 採購統計與 Excel 匯出 */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto shadow-sm p-4 space-y-3">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <BarChart3 size={16} className="text-purple-600" /> 4. 已完成收貨之貨物採購統計 (僅計入已收貨完成項目)
                </h3>
                <div className="flex items-center gap-2">
                  <select
                    value={statsYearFilter}
                    onChange={e => setStatsYearFilter(e.target.value)}
                    className="px-2.5 py-1 border rounded text-xs bg-white font-semibold"
                  >
                    <option value="All">全部年份</option>
                    {availableYears.map(yr => (
                      <option key={yr} value={yr}>{yr}年</option>
                    ))}
                  </select>

                  <select
                    value={statsMonthFilter}
                    onChange={e => setStatsMonthFilter(e.target.value)}
                    className="px-2.5 py-1 border rounded text-xs bg-white font-semibold"
                  >
                    <option value="All">全部月份</option>
                    {['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map(mo => (
                      <option key={mo} value={mo}>{mo}月</option>
                    ))}
                  </select>

                  <button
                    onClick={handleExportCSV}
                    className="flex items-center gap-1 px-3 py-1 bg-emerald-600 text-white rounded text-xs font-semibold hover:bg-emerald-700 transition"
                    title="將現有統計資料匯出成 Excel (CSV)"
                  >
                    <Download size={14} /> 匯出 Excel
                  </button>
                </div>
              </div>

              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs border-b">
                  <tr>
                    <th className="p-3">物品名稱 (Size)</th>
                    <th className="p-3">Product Code</th>
                    <th className="p-3">已完成下單次數</th>
                    <th className="p-3">總下單量 (EA)</th>
                    <th className="p-3">總已收貨量 (EA)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredAnnualPurchaseStats.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-slate-400">此篩選條件下尚無「已收貨完成」的採購記錄</td>
                    </tr>
                  ) : (
                    filteredAnnualPurchaseStats.map((stat, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="p-3 font-semibold text-slate-800">
                          {stat.name} <span className="text-indigo-600 font-bold">({stat.size})</span>
                        </td>
                        <td className="p-3 font-mono text-slate-600">{stat.code}</td>
                        <td className="p-3 font-mono">{stat.count} 次</td>
                        <td className="p-3 font-mono font-bold text-indigo-700">{stat.totalOrdered} EA</td>
                        <td className="p-3 font-mono font-bold text-emerald-700">{stat.totalReceived} EA</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* 借貨與還貨管理分頁 */}
        {activeTab === 'borrow' && isAdmin && (
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="text-xs text-slate-600">
                <p className="font-bold text-slate-900 text-sm">公司借貨與還貨提醒追蹤</p>
                <p>記錄因貨品未到而向公司借貨的資料，標記還貨時必須輸入 PO 號碼以作記錄。</p>
              </div>
              <button
                onClick={() => setShowBorrowModal(true)}
                className="flex items-center gap-1.5 bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-semibold hover:bg-indigo-700 transition"
              >
                <Plus size={15} /> 新增借貨記錄
              </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs border-b">
                  <tr>
                    <th className="p-3">狀態</th>
                    <th className="p-3">借用物品名稱</th>
                    <th className="p-3">數量</th>
                    <th className="p-3">借貨日期</th>
                    <th className="p-3">須還貨日期</th>
                    <th className="p-3">關聯 PR 號碼</th>
                    <th className="p-3">備註 / PO 號碼</th>
                    <th className="p-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {(borrows || []).length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400">目前沒有借貨記錄</td>
                    </tr>
                  ) : (
                    borrows.map(b => {
                      const isOverdue = b.status === 'borrowed' && new Date(b.return_due_date) < new Date();
                      return (
                        <tr key={b.id} className="hover:bg-slate-50/50">
                          <td className="p-3">
                            {b.status === 'returned' ? (
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold">已還貨</span>
                            ) : isOverdue ? (
                              <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded font-bold animate-pulse">⚠️ 逾期未還！</span>
                            ) : (
                              <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded font-bold">借用中 (須還)</span>
                            )}
                          </td>
                          <td className="p-3 font-semibold text-slate-900">{b.item_name}</td>
                          <td className="p-3 font-mono font-bold">{b.borrow_qty} EA</td>
                          <td className="p-3 font-mono">{b.borrow_date}</td>
                          <td className="p-3 font-mono font-semibold text-rose-600">{b.return_due_date}</td>
                          <td className="p-3 font-mono">{b.pr_number || '-'}</td>
                          <td className="p-3 text-slate-500">
                            {b.remarks || '-'}{b.po_number && b.po_number !== '-' ? ` (PO: ${b.po_number})` : ''}
                          </td>
                          <td className="p-3 text-right">
                            {b.status === 'borrowed' && (
                              <button
                                onClick={() => handleReturnBorrow(b)}
                                className="px-3 py-1 bg-emerald-600 text-white rounded text-xs font-semibold hover:bg-emerald-700"
                              >
                                標記已還貨 (填PO)
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Sales 通訊錄分頁 */}
        {activeTab === 'sales' && isAdmin && (
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="relative w-full sm:w-80">
                <Search size={16} className="absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="搜尋品牌、Sales 姓名、電話或耗材..."
                  value={salesSearch}
                  onChange={e => setSalesSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                {combinedSalesList.some(s => s.is_auto) && (
                  <button
                    onClick={handleSyncAutoSalesToDB}
                    disabled={syncingSales}
                    className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-emerald-600 text-white px-3.5 py-2 rounded-lg text-xs font-medium hover:bg-emerald-700 transition"
                  >
                    <RefreshCw size={14} className={syncingSales ? 'animate-spin' : ''} />
                    將自動提取的聯絡人寫入資料庫
                  </button>
                )}
                <button
                  onClick={() => setShowAddSalesModal(true)}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-medium hover:bg-indigo-700 transition"
                >
                  <Plus size={15} /> 新增 Sales 聯絡人
                </button>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs border-b">
                  <tr>
                    <th className="p-3">公司 / 關聯品牌 (Brand)</th>
                    <th className="p-3">Sales 姓名</th>
                    <th className="p-3">電話號碼</th>
                    <th className="p-3">電郵</th>
                    <th className="p-3">負責物料 / 備註</th>
                    <th className="p-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredSales.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400">
                        找不到符合搜尋條件的聯絡人
                      </td>
                    </tr>
                  ) : (
                    filteredSales.map(sales => {
                      const isEditing = editingSalesId === sales.id;
                      return (
                        <tr key={sales.id} className="hover:bg-slate-50/50">
                          <td className="p-3 font-semibold text-slate-900">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editSalesForm.company_name}
                                onChange={e => setEditSalesForm({ ...editSalesForm, company_name: e.target.value })}
                                className="w-full px-2 py-1 border rounded text-xs"
                              />
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <Building2 size={14} className="text-slate-400 shrink-0" />
                                <span>{sales.company_name}</span>
                                {sales.is_auto && (
                                  <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded border border-indigo-200 font-normal">
                                    自動提取
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="p-3 font-medium text-slate-800">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editSalesForm.sales_name}
                                onChange={e => setEditSalesForm({ ...editSalesForm, sales_name: e.target.value })}
                                className="w-full px-2 py-1 border rounded text-xs"
                              />
                            ) : (
                              sales.sales_name
                            )}
                          </td>
                          <td className="p-3">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editSalesForm.phone}
                                onChange={e => setEditSalesForm({ ...editSalesForm, phone: e.target.value })}
                                className="w-full px-2 py-1 border rounded text-xs font-mono"
                              />
                            ) : (
                              sales.phone ? (
                                <div className="flex items-center gap-2">
                                  <a
                                    href={`tel:${sales.phone}`}
                                    className="font-mono text-indigo-600 hover:underline flex items-center gap-1 font-semibold"
                                  >
                                    <Phone size={13} /> {sales.phone}
                                  </a>
                                  <a
                                    href={`https://wa.me/852${sales.phone.replace(/[^0-9]/g, '')}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[11px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200 hover:bg-emerald-100"
                                  >
                                    WhatsApp
                                  </a>
                                </div>
                              ) : '-'
                            )}
                          </td>
                          <td className="p-3 text-slate-600">
                            {isEditing ? (
                              <input
                                type="email"
                                value={editSalesForm.email || ''}
                                onChange={e => setEditSalesForm({ ...editSalesForm, email: e.target.value })}
                                className="w-full px-2 py-1 border rounded text-xs"
                              />
                            ) : (
                              sales.email ? (
                                <a href={`mailto:${sales.email}`} className="flex items-center gap-1 hover:underline">
                                  <Mail size={13} className="text-slate-400" /> {sales.email}
                                </a>
                              ) : '-'
                            )}
                          </td>
                          <td className="p-3 text-slate-500 max-w-md">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editSalesForm.remarks || ''}
                                onChange={e => setEditSalesForm({ ...editSalesForm, remarks: e.target.value })}
                                className="w-full px-2 py-1 border rounded text-xs"
                              />
                            ) : (
                              sales.remarks || '-'
                            )}
                          </td>
                          <td className="p-3 text-right flex items-center justify-end gap-1.5">
                            {isEditing ? (
                              <>
                                <button
                                  onClick={() => handleUpdateSales(sales)}
                                  className="px-2.5 py-1 bg-indigo-600 text-white rounded text-xs font-semibold"
                                >
                                  儲存並自動同步
                                </button>
                                <button
                                  onClick={() => setEditingSalesId(null)}
                                  className="px-2 py-1 border rounded text-xs"
                                >
                                  取消
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => {
                                    setEditingSalesId(sales.id);
                                    setEditSalesForm({
                                      company_name: sales.company_name,
                                      sales_name: sales.sales_name,
                                      phone: sales.phone,
                                      email: sales.email || '',
                                      remarks: sales.remarks || ''
                                    });
                                  }}
                                  className="p-1 text-indigo-600 hover:text-indigo-800"
                                  title="修改聯絡人"
                                >
                                  <Edit3 size={15} />
                                </button>
                                <button
                                  onClick={() => handleDeleteSales(sales.id, sales.sales_name, sales.is_auto)}
                                  className="p-1 text-slate-400 hover:text-red-500"
                                  title="刪除聯絡人"
                                >
                                  <Trash2 size={15} />
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>

      {/* 手動新增下單彈窗 */}
      {showManualOrderModal && isAdmin && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4 my-8">
            <h2 className="text-lg font-bold text-slate-900">手動新增採購下單記錄</h2>
            <form onSubmit={handleManualAddOrderSubmit} className="space-y-3 text-xs">
              <div>
                <label className="font-medium text-slate-700">選擇物品 *</label>
                <select
                  required
                  value={manualOrderForm.item_id}
                  onChange={e => setManualOrderForm({ ...manualOrderForm, item_id: e.target.value })}
                  className="w-full mt-1 border rounded-lg p-2 bg-white text-xs font-semibold"
                >
                  <option value="">-- 請選擇要下單的耗材 --</option>
                  {(items || []).map(i => (
                    <option key={i.id} value={i.id}>
                      {i.name} {i.size ? `(${i.size})` : ''} - [Code: {i.product_code || 'N/A'}]
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-medium text-slate-700">PR 號碼 *</label>
                <input
                  type="text"
                  required
                  placeholder="例如：PR512162..."
                  value={manualOrderForm.pr_number}
                  onChange={e => setManualOrderForm({ ...manualOrderForm, pr_number: e.target.value })}
                  className="w-full mt-1 border rounded-lg p-2 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-medium text-slate-700">下單數量 (EA) *</label>
                  <input
                    type="number"
                    required
                    value={manualOrderForm.order_qty}
                    onChange={e => setManualOrderForm({ ...manualOrderForm, order_qty: Number(e.target.value) || 10 })}
                    className="w-full mt-1 border rounded-lg p-2 font-mono"
                  />
                </div>
                <div>
                  <label className="font-medium text-slate-700">下單日期 *</label>
                  <input
                    type="date"
                    required
                    value={manualOrderForm.order_date}
                    onChange={e => setManualOrderForm({ ...manualOrderForm, order_date: e.target.value })}
                    className="w-full mt-1 border rounded-lg p-2"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button type="button" onClick={() => setShowManualOrderModal(false)} className="px-4 py-2 border rounded-lg">取消</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium">確認送出下單</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 真實相機鏡頭掃描彈窗 */}
      {showScannerModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 text-center space-y-4 shadow-2xl relative">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                <Camera size={18} className="text-indigo-600" /> AI 實時鏡頭條碼掃描
              </h3>
              <button onClick={stopCamera} className="text-slate-400 hover:text-slate-700">
                <X size={20} />
              </button>
            </div>

            <div className="relative w-full h-64 bg-black rounded-xl overflow-hidden flex items-center justify-center">
              <video 
                ref={videoRef} 
                className="w-full h-full object-cover" 
                playsInline 
                muted 
              />
              <div className="absolute inset-0 border-2 border-indigo-500/50 pointer-events-none flex items-center justify-center">
                <div className="w-48 h-20 border-2 border-dashed border-white/80 rounded-lg animate-pulse" />
              </div>
            </div>

            <p className="text-xs text-slate-500">請將條碼對準框內，或直接於下方手動輸入編號</p>

            <input
              type="text"
              placeholder="或者手動輸入 Product Code / 物品名稱..."
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  setSearch((e.target as HTMLInputElement).value);
                  stopCamera();
                }
              }}
              className="w-full px-3 py-2 border rounded-lg text-sm font-mono text-center"
            />
            <button
              onClick={stopCamera}
              className="w-full py-2 bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-300"
            >
              關閉相機
            </button>
          </div>
        </div>
      )}

      {/* 新增物品彈窗 */}
      {showAddModal && isAdmin && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4 my-8">
            <h2 className="text-lg font-bold text-slate-900">新增消耗品 (單位: EA)</h2>
            <form onSubmit={handleAddItem} className="space-y-3 text-xs">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-medium text-slate-700">分類</label>
                  <button
                    type="button"
                    onClick={() => setIsAddingCustomCategory(!isAddingCustomCategory)}
                    className="text-[11px] text-indigo-600 hover:underline flex items-center gap-0.5"
                  >
                    <FolderPlus size={12} />
                    {isAddingCustomCategory ? '選擇現有分類' : '+ 新增自訂分類'}
                  </button>
                </div>

                {isAddingCustomCategory ? (
                  <input
                    type="text"
                    required
                    placeholder="輸入新分類名稱 (例如: Airway, DDA)"
                    value={customCategoryInput}
                    onChange={e => setCustomCategoryInput(e.target.value)}
                    className="w-full border border-indigo-300 ring-1 ring-indigo-300 rounded-lg p-2 bg-indigo-50/30"
                  />
                ) : (
                  <select
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg p-2 bg-white"
                  >
                    {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}
              </div>

              <div>
                <label className="font-medium text-slate-700">名稱 *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full mt-1 border rounded-lg p-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-medium text-slate-700">Brand</label>
                  <input
                    type="text"
                    value={formData.brand}
                    onChange={e => setFormData({ ...formData, brand: e.target.value })}
                    className="w-full mt-1 border rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="font-medium text-slate-700">Size</label>
                  <input
                    type="text"
                    value={formData.size}
                    onChange={e => setFormData({ ...formData, size: e.target.value })}
                    className="w-full mt-1 border rounded-lg p-2"
                  />
                </div>
              </div>

              <div>
                <label className="font-medium text-slate-700">Product Code Number</label>
                <input
                  type="text"
                  value={formData.product_code}
                  onChange={e => setFormData({ ...formData, product_code: e.target.value })}
                  className="w-full mt-1 border rounded-lg p-2 font-mono"
                />
              </div>

              <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-2">
                <label className="font-medium text-slate-700 block">儲存位置 (Location)</label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-slate-500 block mb-1">第一部分 (區域/房)</span>
                    <select
                      value={formData.location_part1}
                      onChange={e => setFormData({ ...formData, location_part1: e.target.value })}
                      className="w-full border rounded-lg p-1.5 bg-white text-xs font-semibold"
                    >
                      {['OT1', 'OT2', 'OT3', 'OT4', 'OT5', 'OT6', 'PACU', 'Rm610', '其他'].map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block mb-1">第二部分 (架/區)</span>
                    <select
                      value={formData.location_part2}
                      onChange={e => setFormData({ ...formData, location_part2: e.target.value })}
                      className="w-full border rounded-lg p-1.5 bg-white text-xs font-semibold"
                    >
                      {['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block mb-1">其他備註 (Free Text)</span>
                  <input
                    type="text"
                    placeholder="例如：櫃門口左側層架"
                    value={formData.location_free}
                    onChange={e => setFormData({ ...formData, location_free: e.target.value })}
                    className="w-full border rounded-lg p-1.5 text-xs bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="font-medium text-slate-700">Sales Contact</label>
                <input
                  type="text"
                  value={formData.sales_contact}
                  onChange={e => setFormData({ ...formData, sales_contact: e.target.value })}
                  className="w-full mt-1 border rounded-lg p-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-medium text-slate-700">現存數量 (EA)</label>
                  <input
                    type="number"
                    value={formData.current_qty}
                    onChange={e => setFormData({ ...formData, current_qty: Number(e.target.value) || 0 })}
                    className="w-full mt-1 border rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="font-medium text-slate-700">最少儲存 (EA)</label>
                  <input
                    type="number"
                    value={formData.min_qty}
                    onChange={e => setFormData({ ...formData, min_qty: Number(e.target.value) || 0 })}
                    className="w-full mt-1 border rounded-lg p-2"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="latex_free_check"
                  checked={formData.is_latex_free}
                  onChange={e => setFormData({ ...formData, is_latex_free: e.target.checked })}
                  className="w-4 h-4 text-indigo-600 rounded border-slate-300"
                />
                <label htmlFor="latex_free_check" className="font-medium text-slate-700">標記為 Latex Free (無乳膠)</label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 border rounded-lg">取消</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium">確認新增</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 新增借貨彈窗 */}
      {showBorrowModal && isAdmin && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4 my-8">
            <h2 className="text-lg font-bold text-slate-900">新增公司借貨記錄</h2>
            <form onSubmit={handleAddBorrow} className="space-y-3 text-xs">
              <div>
                <label className="font-medium text-slate-700">借用物品名稱 *</label>
                <input
                  type="text"
                  required
                  placeholder="例如：7.0 ETT"
                  value={borrowForm.item_name}
                  onChange={e => setBorrowForm({ ...borrowForm, item_name: e.target.value })}
                  className="w-full mt-1 border rounded-lg p-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-medium text-slate-700">借貨數量 (EA) *</label>
                  <input
                    type="number"
                    required
                    value={borrowForm.borrow_qty}
                    onChange={e => setBorrowForm({ ...borrowForm, borrow_qty: Number(e.target.value) || 1 })}
                    className="w-full mt-1 border rounded-lg p-2 font-mono"
                  />
                </div>
                <div>
                  <label className="font-medium text-slate-700">關聯 PR 號碼</label>
                  <input
                    type="text"
                    placeholder="PR165456"
                    value={borrowForm.pr_number}
                    onChange={e => setBorrowForm({ ...borrowForm, pr_number: e.target.value })}
                    className="w-full mt-1 border rounded-lg p-2 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="font-medium text-slate-700">PO 號碼 (選填)</label>
                <input
                  type="text"
                  placeholder="PO123456"
                  value={borrowForm.po_number}
                  onChange={e => setBorrowForm({ ...borrowForm, po_number: e.target.value })}
                  className="w-full mt-1 border rounded-lg p-2 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-medium text-slate-700">借貨日期 *</label>
                  <input
                    type="date"
                    required
                    value={borrowForm.borrow_date}
                    onChange={e => setBorrowForm({ ...borrowForm, borrow_date: e.target.value })}
                    className="w-full mt-1 border rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="font-medium text-slate-700">須還貨日期 *</label>
                  <input
                    type="date"
                    required
                    value={borrowForm.return_due_date}
                    onChange={e => setBorrowForm({ ...borrowForm, return_due_date: e.target.value })}
                    className="w-full mt-1 border rounded-lg p-2 text-rose-600 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="font-medium text-slate-700">備註 (例如：向邊間醫院或公司借)</label>
                <textarea
                  rows={2}
                  value={borrowForm.remarks}
                  onChange={e => setBorrowForm({ ...borrowForm, remarks: e.target.value })}
                  className="w-full mt-1 border rounded-lg p-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button type="button" onClick={() => setShowBorrowModal(false)} className="px-4 py-2 border rounded-lg">取消</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium">確認新增</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 新增 Sales 彈窗 */}
      {showAddSalesModal && isAdmin && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4 my-8">
            <h2 className="text-lg font-bold text-slate-900">新增 Sales 聯絡人</h2>
            <form onSubmit={handleAddSales} className="space-y-3 text-xs">
              <div>
                <label className="font-medium text-slate-700">公司名稱 *</label>
                <input
                  type="text"
                  required
                  placeholder="例如：Medtronic / Teleflex"
                  value={salesForm.company_name}
                  onChange={e => setSalesForm({ ...salesForm, company_name: e.target.value })}
                  className="w-full mt-1 border rounded-lg p-2"
                />
              </div>

              <div>
                <label className="font-medium text-slate-700">Sales 姓名 *</label>
                <input
                  type="text"
                  required
                  placeholder="例如：John Chan"
                  value={salesForm.sales_name}
                  onChange={e => setSalesForm({ ...salesForm, sales_name: e.target.value })}
                  className="w-full mt-1 border rounded-lg p-2"
                />
              </div>

              <div>
                <label className="font-medium text-slate-700">電話號碼 *</label>
                <input
                  type="text"
                  required
                  placeholder="例如：91234567"
                  value={salesForm.phone}
                  onChange={e => setSalesForm({ ...salesForm, phone: e.target.value })}
                  className="w-full mt-1 border rounded-lg p-2 font-mono"
                />
              </div>

              <div>
                <label className="font-medium text-slate-700">電郵地址 (選填)</label>
                <input
                  type="email"
                  placeholder="example@company.com"
                  value={salesForm.email}
                  onChange={e => setSalesForm({ ...salesForm, email: e.target.value })}
                  className="w-full mt-1 border rounded-lg p-2"
                />
              </div>

              <div>
                <label className="font-medium text-slate-700">備註 / 負責物料 (選填)</label>
                <textarea
                  rows={2}
                  placeholder="負責物料備註"
                  value={salesForm.remarks}
                  onChange={e => setSalesForm({ ...salesForm, remarks: e.target.value })}
                  className="w-full mt-1 border rounded-lg p-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button type="button" onClick={() => setShowAddSalesModal(false)} className="px-4 py-2 border rounded-lg">取消</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium">確認新增</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}