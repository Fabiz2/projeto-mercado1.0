import sqlite3
import time


def main():
    conn = sqlite3.connect('data/mercado.db')
    conn.row_factory = sqlite3.Row

    seen = set()
    for r in conn.execute('SELECT id FROM pedidos'):
        seen.add(r['id'])

    print('Monitorando novos pedidos em data/mercado.db (Ctrl+C para sair)')

    try:
        while True:
            rows = conn.execute(
                'SELECT id, total_cents, payment_method, created_at FROM pedidos ORDER BY created_at DESC LIMIT 50'
            ).fetchall()

            emitted = False
            for r in reversed(rows):
                if r['id'] not in seen:
                    total_reais = (r['total_cents'] or 0) / 100.0
                    print(f"[novo pedido] {r['created_at']} id={r['id']} total=R$ {total_reais:.2f} metodo={r['payment_method']}")

                    items = conn.execute(
                        'SELECT product_id, qty, unit_price_cents FROM itens_pedido WHERE pedido_id = ? ORDER BY id',
                        (r['id'],),
                    ).fetchall()
                    for it in items:
                        unit_reais = (it['unit_price_cents'] or 0) / 100.0
                        print(f"  - item product_id={it['product_id']} qty={it['qty']} unit=R$ {unit_reais:.2f}")

                    seen.add(r['id'])
                    emitted = True

            time.sleep(0.3 if emitted else 1.0)
    except KeyboardInterrupt:
        pass
    finally:
        conn.close()


if __name__ == '__main__':
    main()