import { db } from './db.ts';
import { getCurrentMonthKey } from './security.ts';

export function loadDemoDataIntoDb(): void {
  const monthKey = getCurrentMonthKey();

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM bazar_items').run();
    db.prepare('DELETE FROM bazar_transactions').run();
    db.prepare('DELETE FROM meals').run();
    db.prepare('DELETE FROM individual_expenses').run();
    db.prepare('DELETE FROM deposits').run();
    db.prepare('DELETE FROM monthly_reports').run();
    db.prepare('DELETE FROM members').run();

    const insertMember = db.prepare(
      `INSERT INTO members (name, phone, photo_url, join_date, is_active, notes)
       VALUES (?, ?, '', ?, 1, ?)`
    );

    const rahimId = Number(
      insertMember.run('রহিম আহমেদ (Rahim)', '01711-000101', `${monthKey}-01`, 'Room 101').lastInsertRowid
    );
    const karimId = Number(
      insertMember.run('করিম হোসেন (Karim)', '01812-000102', `${monthKey}-01`, 'Room 102').lastInsertRowid
    );
    const sumonId = Number(
      insertMember.run('সুমন মিয়া (Sumon)', '01913-000103', `${monthKey}-01`, 'Room 103').lastInsertRowid
    );
    const tanvirId = Number(
      insertMember.run('তানভীর ইসলাম (Tanvir)', '01614-000104', `${monthKey}-02`, 'Room 104').lastInsertRowid
    );

    const insertDeposit = db.prepare(
      `INSERT INTO deposits (member_id, deposit_date, month_key, amount, payment_method, note)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    insertDeposit.run(rahimId, `${monthKey}-01`, monthKey, 3500, 'cash', 'Initial monthly deposit');
    insertDeposit.run(karimId, `${monthKey}-01`, monthKey, 3000, 'bkash', 'bKash transfer');
    insertDeposit.run(sumonId, `${monthKey}-02`, monthKey, 2500, 'nagad', 'First installment');
    insertDeposit.run(tanvirId, `${monthKey}-02`, monthKey, 3200, 'cash', 'Monthly deposit');
    insertDeposit.run(rahimId, `${monthKey}-10`, monthKey, 1000, 'bkash', 'Mid-month top-up');

    const insertBazar = db.prepare(
      `INSERT INTO bazar_transactions (bazar_date, month_key, title, shopper_member_id, shopper_name, total_amount, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const insertItem = db.prepare(
      `INSERT INTO bazar_items (transaction_id, item_name, quantity, unit, unit_price, total_price)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    const b1 = Number(
      insertBazar.run(
        `${monthKey}-01`,
        monthKey,
        'সাপ্তাহিক প্রধান বাজার',
        rahimId,
        'রহিম আহমেদ (Rahim)',
        1620,
        'চাল, আলু, ডিম, তেল'
      ).lastInsertRowid
    );
    insertItem.run(b1, 'মিনিকেট চাল', 10, 'কেজি', 70, 700);
    insertItem.run(b1, 'আলু', 5, 'কেজি', 40, 200);
    insertItem.run(b1, 'ফার্মের ডিম', 30, 'পিস', 12, 360);
    insertItem.run(b1, 'সয়াবিন তেল', 2, 'লিটার', 180, 360);

    const b2 = Number(
      insertBazar.run(
        `${monthKey}-03`,
        monthKey,
        'মাছ ও সবজি বাজার',
        karimId,
        'করিম হোসেন (Karim)',
        1350,
        'রুই মাছ ও কাঁচাবাজার'
      ).lastInsertRowid
    );
    insertItem.run(b2, 'রুই মাছ', 2.5, 'কেজি', 360, 900);
    insertItem.run(b2, 'পেঁয়াজ ও কাঁচামরিচ', 3, 'কেজি', 150, 450);

    const b3 = Number(
      insertBazar.run(
        `${monthKey}-06`,
        monthKey,
        'মুরগি ও মসলা বাজার',
        tanvirId,
        'তানভীর ইসলাম (Tanvir)',
        1480,
        'ব্রয়লার মুরগি ও ডাল'
      ).lastInsertRowid
    );
    insertItem.run(b3, 'ব্রয়লার মুরগি', 4, 'কেজি', 210, 840);
    insertItem.run(b3, 'মসুর ডাল', 3, 'কেজি', 140, 420);
    insertItem.run(b3, 'আদা-রসুন-হলুদ', 1, 'প্যাকেট', 220, 220);

    const insertMeal = db.prepare(
      `INSERT INTO meals (member_id, meal_date, month_key, breakfast, lunch, dinner, extra_meal, total_meal, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const days = [
      { day: '01', data: [[rahimId, 0, 1, 1, 0], [karimId, 0, 1, 0, 0], [sumonId, 0, 0, 0, 0], [tanvirId, 0, 1, 1, 0]] },
      { day: '02', data: [[rahimId, 0, 1, 1, 0], [karimId, 0, 1, 1, 0], [sumonId, 0, 1, 1, 0], [tanvirId, 0, 1, 1, 0]] },
      { day: '03', data: [[rahimId, 0, 1, 1, 1], [karimId, 0, 1, 1, 0], [sumonId, 0, 1, 0, 0], [tanvirId, 0, 1, 1, 0]] },
      { day: '04', data: [[rahimId, 0, 1, 1, 0], [karimId, 0, 1, 1, 0], [sumonId, 0, 1, 1, 0], [tanvirId, 0, 0, 1, 0]] },
      { day: '05', data: [[rahimId, 0, 1, 1, 0], [karimId, 0, 1, 1, 0], [sumonId, 0, 1, 1, 0], [tanvirId, 0, 1, 1, 0]] },
      { day: '06', data: [[rahimId, 0, 1, 1, 0], [karimId, 0, 1, 1, 0], [sumonId, 0, 1, 1, 0], [tanvirId, 0, 1, 1, 1]] },
    ];

    for (const d of days) {
      const dateStr = `${monthKey}-${d.day}`;
      for (const [mId, b, l, din, ex] of d.data) {
        const total = b + l + din + ex;
        insertMeal.run(mId, dateStr, monthKey, b, l, din, ex, total, '');
      }
    }

    const insertExp = db.prepare(
      `INSERT INTO individual_expenses (expense_date, month_key, expense_type, member_id, title, amount, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    insertExp.run(`${monthKey}-03`, monthKey, 'individual', rahimId, 'অতিরিক্ত খাবার / দই', 50, 'Personal extra');
    insertExp.run(`${monthKey}-04`, monthKey, 'individual', karimId, 'ব্যক্তিগত বাজার', 100, 'Personal item');
    insertExp.run(`${monthKey}-05`, monthKey, 'individual', sumonId, 'বিকালের নাস্তা', 30, 'Tea & snacks');
    insertExp.run(`${monthKey}-02`, monthKey, 'common', null, 'সিলিন্ডার গ্যাস রিফিল', 1200, 'Shared mess gas cylinder');

    db.prepare(`UPDATE settings SET value = 'true', updated_at = datetime('now') WHERE key = 'demo_mode'`).run();
  });

  tx();
}

export function clearMessOperationalData(): void {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM bazar_items').run();
    db.prepare('DELETE FROM bazar_transactions').run();
    db.prepare('DELETE FROM meals').run();
    db.prepare('DELETE FROM individual_expenses').run();
    db.prepare('DELETE FROM deposits').run();
    db.prepare('DELETE FROM monthly_reports').run();
    db.prepare('DELETE FROM members').run();
    db.prepare(`UPDATE settings SET value = 'false', updated_at = datetime('now') WHERE key = 'demo_mode'`).run();
  });
  tx();
}
