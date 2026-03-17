/**
 * Derive alcohol choice, meal choice, and discounts for overnight confirmation emails.
 * @param {Object} roomDetails - Parsed room details with finalData
 * @param {Object} paymentFields - { discountApplied, multiNightDiscount, voucherApplied, voucher }
 * @returns {{ alcoholChoice: string, mealChoice: string, discountsSummary: string }}
 */
function getOvernightAddonsForEmail(roomDetails, paymentFields = {}) {
  const isOvernight = !!(roomDetails?.visitDate || roomDetails?.selectedRooms);
  if (!isOvernight) {
    return { alcoholChoice: 'N/A', mealChoice: 'N/A', discountsSummary: 'N/A' };
  }
  const finalData = roomDetails?.finalData || [];
  const hasAlcohol = finalData.some(
    (e) => e.key === 'overnightAlcoholPackage' || e.type === 'overnightAlcoholPackage'
  );
  const has2Not3 = finalData.some((e) => e.type === 'twoNot3MealOption');
  const has3Meal = finalData.some((e) => e.type === 'threeMealOption');

  const alcoholChoice = hasAlcohol ? 'Alcohol Package' : 'Non-Alcohol Access';
  let mealChoice = 'Not selected';
  if (has2Not3) mealChoice = '2Not3 meal option (2 meals per day, 10% discount)';
  else if (has3Meal) mealChoice = '3 meal option (3 meals per day)';

  const discounts = [];
  if (
    paymentFields.discountApplied === 'true' ||
    (paymentFields.multiNightDiscount && Number(paymentFields.multiNightDiscount) > 0)
  ) {
    discounts.push('Multi-night discount');
  }
  if (has2Not3) discounts.push('10% discount (2Not3 meal option)');
  if (
    paymentFields.voucherApplied === 'true' ||
    (paymentFields.voucher && Number(paymentFields.voucher) > 0)
  ) {
    discounts.push('Voucher/Club member discount');
  }
  const discountsSummary = discounts.length > 0 ? discounts.join(', ') : 'None';

  return { alcoholChoice, mealChoice, discountsSummary };
}

module.exports = { getOvernightAddonsForEmail };
