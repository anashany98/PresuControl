import sys
sys.path.insert(0, '/app')
from app.main import normalize_import_df, row_to_payload
import pandas as pd

df_raw = pd.read_excel('/tmp/test.xlsx')
df = normalize_import_df(df_raw)

for i in range(min(10, len(df))):
    p = row_to_payload(df.iloc[i])
    np_val = p.get('numero_presupuesto')
    cli = p.get('cliente')
    cod = p.get('codigo_cliente_factusol')
    ped = p.get('numero_pedido_cliente')
    fecha = p.get('fecha_presupuesto')
    print(f"Row {i+1}: presu={np_val}, cli={cli[:30] if cli else ''}, cod={cod}, ped={ped}, fecha={fecha}")
