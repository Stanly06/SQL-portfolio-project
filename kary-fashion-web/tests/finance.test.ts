// Pruebas de las fórmulas financieras. Ejecutar con: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildIncomeStatement, changePct, marginPct, splitTax } from "../src/lib/finance.ts";
import { buildDemoDashboard } from "../src/lib/demo-data.ts";

const base = {
  grossSales: 100_000_00, discounts: 4_000_00, returns: 1_000_00, salesTax: 17_100_00,
  costOfGoodsSold: 50_000_00, operatingExpenses: 20_000_00, financialExpenses: 1_000_00,
  incomeTax: 2_000_00, inventoryPurchases: 80_000_00,
};

test("ingresos netos = ventas brutas - descuentos - devoluciones (sin ITBIS)", () => {
  assert.equal(buildIncomeStatement(base).netRevenue, 95_000_00);
});

test("ganancia bruta, operativa y neta en cascada", () => {
  const r = buildIncomeStatement(base);
  assert.equal(r.grossProfit, 45_000_00);
  assert.equal(r.operatingProfit, 25_000_00);
  assert.equal(r.netProfit, 22_000_00);
  assert.equal(r.grossMarginPct, 47.4);
});

test("las compras de inventario NO reducen la ganancia", () => {
  const a = buildIncomeStatement(base);
  const b = buildIncomeStatement({ ...base, inventoryPurchases: 999_999_00 });
  assert.equal(a.netProfit, b.netProfit);
});

test("el ITBIS cobrado no cambia los ingresos", () => {
  assert.equal(buildIncomeStatement({ ...base, salesTax: 0 }).netRevenue, buildIncomeStatement(base).netRevenue);
});

test("márgenes y variaciones con base cero", () => {
  assert.equal(marginPct(10, 0), 0);
  assert.equal(changePct(110, 100), 10);
  assert.equal(changePct(5, 0), null);
});

test("ITBIS 18% incluido en el precio", () => {
  assert.deepEqual(splitTax(118_00), { base: 100_00, tax: 18_00 });
});

test("la demo es determinística y siempre está marcada como demostración", () => {
  for (const p of ["day", "week", "month", "year"] as const) {
    const a = buildDemoDashboard(p);
    assert.equal(a.isDemo, true);
    assert.deepEqual(a, buildDemoDashboard(p));
    assert.equal(a.kpis.sales.value, a.income.netRevenue);
    assert.equal(a.kpis.orders.pending + a.kpis.orders.completed, a.kpis.orders.total);
  }
});
