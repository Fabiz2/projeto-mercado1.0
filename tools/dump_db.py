import sqlite3


def main():
    conn = sqlite3.connect('data/mercado.db')
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    print('PEDIDOS:')
    print('id\ttotal_cents\tpayment_method\tpayment_installments\tinterest_cents\ttotal_with_interest_cents\tcreated_at')
    for r in cur.execute('SELECT id, total_cents, payment_method, payment_installments, interest_cents, total_with_interest_cents, created_at FROM pedidos ORDER BY created_at DESC'):
        print(f"{r['id']}\t{r['total_cents']}\t{r['payment_method']}\t{r['payment_installments']}\t{r['interest_cents']}\t{r['total_with_interest_cents']}\t{r['created_at']}")

    print('\nITENS_PEDIDO:')
    print('id\tpedido_id\tproduct_id\tqty\tunit_price_cents')
    for r in cur.execute('SELECT id, pedido_id, product_id, qty, unit_price_cents FROM itens_pedido ORDER BY id'):
        print(f"{r['id']}\t{r['pedido_id']}\t{r['product_id']}\t{r['qty']}\t{r['unit_price_cents']}")

    conn.close()


if __name__ == '__main__':
    main()