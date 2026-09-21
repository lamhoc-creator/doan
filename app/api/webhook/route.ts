import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("🔥 ĐÃ NHẬN WEBHOOK TỪ APP TRUNG GIAN:", body);

    const rawContent = body.content || body.description || '';
    const transferAmount = body.transferAmount || body.amountIn || 0;

    if (!rawContent) {
      return NextResponse.json({ success: false, message: 'Thiếu nội dung chuyển khoản' }, { status: 400 });
    }

    // Tự động tìm đoạn mã dạng DH_xxxx nằm trong nội dung chuyển khoản
    const match = rawContent.match(/DH_\d+/i);
    const orderCode = match ? match[0] : rawContent.trim();

    console.log("🔍 Mã đơn hàng trích xuất được từ nội dung:", orderCode);

    // Tìm đơn hàng trong Supabase theo mã trích xuất
    const { data: orders, error: fetchError } = await supabase
      .from('orders')
      .select('*')
      .eq('status', 'pending')
      .ilike('content', `%${orderCode}%`);

    if (fetchError || !orders || orders.length === 0) {
      console.log("⚠️ Không tìm thấy đơn hàng khớp với mã:", orderCode);
      return NextResponse.json({ success: false, message: 'Không tìm thấy đơn hàng' }, { status: 404 });
    }

    const targetOrder = orders[0];

    // Kiểm tra số tiền
    if (Number(transferAmount) < Number(targetOrder.total_amount)) {
      console.log(`⚠️ Số tiền chuyển (${transferAmount}) nhỏ hơn tổng đơn (${targetOrder.total_amount})`);
      return NextResponse.json({ success: false, message: 'Số tiền thanh toán không đủ' }, { status: 400 });
    }

    // Update trạng thái thành 'paid'
    const { error: updateError } = await supabase
      .from('orders')
      .update({ 
        status: 'paid', 
        updated_at: new Date().toISOString() 
      })
      .eq('id', targetOrder.id);

    if (updateError) {
      console.error('❌ Lỗi update database:', updateError);
      return NextResponse.json({ success: false, message: 'Lỗi cập nhật database' }, { status: 500 });
    }

    console.log(`✅ Đơn hàng ${targetOrder.content} đã được xác nhận thanh toán thành công!`);

    return NextResponse.json({ 
      success: true, 
      message: 'Xác nhận thanh toán thành công',
      orderId: targetOrder.id 
    });

  } catch (error: any) {
    console.error('❌ Lỗi xử lý Webhook:', error.message);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}