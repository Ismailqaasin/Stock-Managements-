CREATE FUNCTION business_today() RETURNS date LANGUAGE sql STABLE AS $$ SELECT (now() AT TIME ZONE time_zone)::date FROM system_settings WHERE id=1 $$;
CREATE FUNCTION next_reference(p text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE y int:=extract(year FROM business_today()); n int;
BEGIN INSERT INTO reference_counters VALUES(p,y,1) ON CONFLICT(prefix,year) DO UPDATE SET last_number=reference_counters.last_number+1 RETURNING last_number INTO n;
RETURN p||'-'||y||'-'||lpad(n::text,greatest(5,length(n::text)), '0'); END $$;
CREATE FUNCTION log_event(act text, entity text, eid int, description text, ref text DEFAULT NULL, old_data jsonb DEFAULT NULL, new_data jsonb DEFAULT NULL) RETURNS void LANGUAGE sql AS $$
INSERT INTO audit_logs(admin_id,action,entity_type,entity_id,description,reference_no,old_values,new_values,ip_address,user_agent)
VALUES((SELECT id FROM admin_users LIMIT 1),act,entity,eid,description,ref,old_data,new_data,nullif(current_setting('stockms.ip',true),''),left(current_setting('stockms.agent',true),500)) $$;
CREATE FUNCTION reserved_units(pid int) RETURNS bigint LANGUAGE sql STABLE AS $$ SELECT coalesce(sum(i.quantity),0) FROM order_items i JOIN orders o ON o.id=i.order_id WHERE i.product_id=pid AND o.status='Pending' $$;
-- The only writer of products.current_stock. The outer document transaction owns the lock.
CREATE FUNCTION stock_service(pid int, delta int, kind text, src text, sid int, ref text, day date, note text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE balance int;
BEGIN
 UPDATE products SET current_stock=current_stock+delta, updated_at=now() WHERE id=pid AND current_stock::bigint+delta>=reserved_units(pid) RETURNING current_stock INTO balance;
 IF NOT FOUND THEN RAISE EXCEPTION 'Not enough available stock. Check pending reservations.'; END IF;
 INSERT INTO stock_movements(product_id,quantity,movement_type,stock_before,stock_after,source_type,source_id,reference_no,occurred_at,notes) VALUES(pid,delta,kind,balance-delta,balance,src,sid,ref,day,note);
 PERFORM log_event('Movement',src,sid,kind||' · '||ref,ref,jsonb_build_object('stock',balance-delta),jsonb_build_object('product_id',pid,'stock',balance));
END $$;
CREATE FUNCTION require_lines(b jsonb) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 IF jsonb_typeof(b->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(b->'items') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Add between 1 and 100 line items.'; END IF;
END $$;
CREATE FUNCTION active_product(pid int) RETURNS products LANGUAGE plpgsql AS $$ DECLARE p products; BEGIN SELECT * INTO p FROM products WHERE id=pid AND is_active; IF NOT FOUND THEN RAISE EXCEPTION 'Select an active product.'; END IF; RETURN p; END $$;
CREATE FUNCTION order_transition(eid int, op text, why text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE o orders; i order_items;
BEGIN SELECT * INTO STRICT o FROM orders WHERE id=eid FOR UPDATE;
 IF op='confirm' AND o.status='Pending' THEN
  UPDATE orders SET status='Confirmed',confirmed_at=now(),updated_at=now() WHERE id=eid;
  FOR i IN SELECT * FROM order_items WHERE order_id=eid ORDER BY product_id LOOP
   PERFORM active_product(i.product_id); PERFORM stock_service(i.product_id,-i.quantity,'OrderOut','orders',eid,o.order_no,o.order_date,o.notes);
  END LOOP;
 ELSIF op='deliver' AND o.status='Confirmed' THEN UPDATE orders SET status='Delivered',delivered_at=now(),updated_at=now() WHERE id=eid;
 ELSIF op='cancel' AND o.status IN ('Pending','Confirmed') THEN
  IF nullif(trim(why),'') IS NULL THEN RAISE EXCEPTION 'A cancellation reason is required.'; END IF;
  IF EXISTS(SELECT 1 FROM returns WHERE order_id=eid AND status<>'Rejected') THEN RAISE EXCEPTION 'This order has a return and cannot be cancelled.'; END IF;
  UPDATE orders SET status='Cancelled',cancel_reason=why,cancelled_at=now(),updated_at=now() WHERE id=eid;
  IF o.status='Confirmed' THEN FOR i IN SELECT * FROM order_items WHERE order_id=eid LOOP PERFORM stock_service(i.product_id,i.quantity,'OrderCancelReversal','orders',eid,o.order_no,business_today(),why); END LOOP; END IF;
 ELSE RAISE EXCEPTION 'This action is not available for the current order status.'; END IF;
END $$;
-- All commands take the same transaction-scoped write lock. A deliberate single-warehouse
-- trade-off: document creation, reservations, movements, counters and audit either all commit or none do.
CREATE FUNCTION stock_command(resource text, op text, eid int, b jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE rid int:=eid; pid int:=nullif(b->>'product_id','')::int; qty int:=nullif(b->>'quantity','')::int;
 day date:=coalesce(nullif(b->>'date','')::date,business_today()); ref text; why text:=nullif(trim(b->>'reason'),''); item jsonb;
 p products; o orders; oi order_items; ret returns; si stock_ins; so stock_outs; ln record; current_version text; old_data jsonb; new_data jsonb; tab text; label text;
BEGIN
 PERFORM pg_advisory_xact_lock(55327,1);
 tab:=CASE resource WHEN 'products' THEN 'products' WHEN 'customers' THEN 'customers' WHEN 'categories' THEN 'categories' WHEN 'stock-ins' THEN 'stock_ins' WHEN 'stock-outs' THEN 'stock_outs' WHEN 'orders' THEN 'orders' WHEN 'returns' THEN 'returns' WHEN 'stock-adjustments' THEN 'stock_adjustments' WHEN 'settings' THEN 'system_settings' END;
 IF tab IS NULL THEN RAISE EXCEPTION 'Unknown resource'; END IF;
 IF resource='settings' THEN rid:=1; END IF;
 IF rid IS NOT NULL THEN
  EXECUTE format('SELECT to_jsonb(t), xmin::text FROM %I t WHERE id=$1 FOR UPDATE',tab) INTO old_data,current_version USING rid;
  IF old_data IS NULL THEN RAISE NO_DATA_FOUND; END IF;
  IF op='update' AND b->>'version' IS DISTINCT FROM current_version THEN RAISE EXCEPTION 'This record changed. Reload before saving.' USING ERRCODE='40001'; END IF;
 END IF;
 IF resource IN ('products','customers','categories') AND op='status' THEN
  IF resource='products' AND (b->>'is_active')::boolean=false AND reserved_units(rid)>0 THEN RAISE EXCEPTION 'Reserved products cannot be archived.'; END IF;
  EXECUTE format('UPDATE %I SET is_active=$1,updated_at=now() WHERE id=$2',tab) USING (b->>'is_active')::boolean,rid;
 ELSIF resource='products' AND op IN ('create','update') THEN
  IF nullif(b->>'category_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM categories WHERE id=(b->>'category_id')::int AND (is_active OR id=(old_data->>'category_id')::int)) THEN RAISE EXCEPTION 'Select an active category.'; END IF;
  IF op='create' THEN INSERT INTO products(name,sku,description,category_id,selling_price,low_stock_threshold) VALUES(trim(b->>'name'),upper(trim(b->>'sku')),b->>'description',nullif(b->>'category_id','')::int,(b->>'selling_price')::numeric,nullif(b->>'low_stock_threshold','')::int) RETURNING id INTO rid;
  ELSE UPDATE products SET name=trim(b->>'name'),sku=upper(trim(b->>'sku')),description=b->>'description',category_id=nullif(b->>'category_id','')::int,selling_price=(b->>'selling_price')::numeric,low_stock_threshold=nullif(b->>'low_stock_threshold','')::int,updated_at=now() WHERE id=rid; END IF;
 ELSIF resource='categories' AND op IN ('create','update') THEN
  IF op='create' THEN INSERT INTO categories(name,description) VALUES(trim(b->>'name'),b->>'description') RETURNING id INTO rid; ELSE UPDATE categories SET name=trim(b->>'name'),description=b->>'description',updated_at=now() WHERE id=rid; END IF;
 ELSIF resource='customers' AND op IN ('create','update') THEN
  IF op='create' THEN INSERT INTO customers(full_name,phone,email,gender,location,notes) VALUES(trim(b->>'full_name'),nullif(trim(b->>'phone'),''),b->>'email',nullif(b->>'gender',''),b->>'location',b->>'notes') RETURNING id INTO rid;
  ELSE UPDATE customers SET full_name=trim(b->>'full_name'),phone=nullif(trim(b->>'phone'),''),email=b->>'email',gender=nullif(b->>'gender',''),location=b->>'location',notes=b->>'notes',updated_at=now() WHERE id=rid; END IF;
 ELSIF resource='stock-ins' AND op='create' THEN
  PERFORM require_lines(b); ref:=next_reference('SI'); INSERT INTO stock_ins(reference_no,received_date,source_name,external_ref,notes) VALUES(ref,day,b->>'source_name',b->>'external_ref',b->>'notes') RETURNING id INTO rid;
  FOR item IN SELECT value FROM jsonb_array_elements(b->'items') LOOP
   pid:=(item->>'product_id')::int; qty:=(item->>'quantity')::int; PERFORM active_product(pid);
   INSERT INTO stock_in_items(stock_in_id,product_id,quantity) VALUES(rid,pid,qty); PERFORM stock_service(pid,qty,'StockIn',resource,rid,ref,day,b->>'notes'); END LOOP;
 ELSIF resource='stock-ins' AND op='reverse' THEN
  SELECT * INTO si FROM stock_ins WHERE id=rid; IF si.status<>'Completed' OR why IS NULL THEN RAISE EXCEPTION 'Reversal requires a completed receipt and a reason.'; END IF;
  ref:=si.reference_no; FOR ln IN SELECT * FROM stock_in_items WHERE stock_in_id=rid LOOP PERFORM stock_service(ln.product_id,-ln.quantity,'StockInReversal',resource,rid,ref,business_today(),why); END LOOP;
  UPDATE stock_ins SET status='Reversed',reversed_at=now(),reversal_reason=why WHERE id=rid;
 ELSIF resource='stock-outs' AND op='create' THEN
  PERFORM active_product(pid); ref:=next_reference('SO'); INSERT INTO stock_outs(reference_no,type,product_id,quantity,recipient_name,reason,out_date,notes) VALUES(ref,b->>'type',pid,qty,trim(b->>'recipient_name'),why,day,b->>'notes') RETURNING id INTO rid;
  PERFORM stock_service(pid,-qty,(b->>'type')||'Out',resource,rid,ref,day,why);
 ELSIF resource='stock-outs' AND op='reverse' THEN
  SELECT * INTO so FROM stock_outs WHERE id=rid; IF so.status<>'Completed' OR why IS NULL THEN RAISE EXCEPTION 'Reversal requires a completed dispatch and a reason.'; END IF;
  ref:=so.reference_no; PERFORM stock_service(so.product_id,so.quantity,'StockOutReversal',resource,rid,ref,business_today(),why); UPDATE stock_outs SET status='Reversed',reversed_at=now(),reversal_reason=why WHERE id=rid;
 ELSIF resource='orders' AND op IN ('create','update') THEN
  PERFORM require_lines(b); IF b->>'customer_type'='Registered' AND NOT EXISTS(SELECT 1 FROM customers WHERE id=nullif(b->>'customer_id','')::int AND is_active) THEN RAISE EXCEPTION 'Select an active customer.'; END IF;
  IF op='create' THEN ref:=next_reference('ORD'); INSERT INTO orders(order_no,customer_type,customer_id,cash_customer_name,cash_customer_phone,order_date,notes) VALUES(ref,b->>'customer_type',nullif(b->>'customer_id','')::int,b->>'cash_customer_name',b->>'cash_customer_phone',day,b->>'notes') RETURNING id INTO rid;
  ELSE IF old_data->>'status'<>'Pending' THEN RAISE EXCEPTION 'Only pending orders can be edited.'; END IF;
   UPDATE orders SET customer_type=b->>'customer_type',customer_id=nullif(b->>'customer_id','')::int,cash_customer_name=b->>'cash_customer_name',cash_customer_phone=b->>'cash_customer_phone',order_date=day,notes=b->>'notes',updated_at=now() WHERE id=rid;
   DELETE FROM order_items WHERE order_id=rid;
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(b->'items') LOOP
   pid:=(item->>'product_id')::int; qty:=(item->>'quantity')::int; p:=active_product(pid);
   IF p.current_stock-reserved_units(pid)<qty THEN RAISE EXCEPTION 'Not enough available stock for %.',p.name; END IF;
   INSERT INTO order_items(order_id,product_id,quantity,unit_price) VALUES(rid,pid,qty,coalesce(nullif(item->>'unit_price','')::numeric,p.selling_price)); END LOOP;
  UPDATE orders SET total_amount=(SELECT sum(line_total) FROM order_items WHERE order_id=rid) WHERE id=rid;
  IF (b->>'confirm')::boolean THEN PERFORM order_transition(rid,'confirm',NULL); END IF;
 ELSIF resource='orders' AND op IN ('confirm','deliver','cancel') THEN PERFORM order_transition(rid,op,why);
 ELSIF resource='returns' AND op='create' THEN
  PERFORM require_lines(b); SELECT * INTO STRICT o FROM orders WHERE id=(b->>'order_id')::int; IF o.status NOT IN ('Confirmed','Delivered') THEN RAISE EXCEPTION 'Select a confirmed or delivered order.'; END IF;
  ref:=next_reference('RET'); INSERT INTO returns(return_no,order_id,return_date,reason,notes) VALUES(ref,o.id,day,why,b->>'notes') RETURNING id INTO rid;
  FOR item IN SELECT value FROM jsonb_array_elements(b->'items') LOOP
   SELECT * INTO STRICT oi FROM order_items WHERE id=(item->>'order_item_id')::int AND order_id=o.id; qty:=(item->>'quantity')::int;
   IF qty>oi.quantity-oi.returned_qty-coalesce((SELECT sum(i.quantity) FROM return_items i JOIN returns r ON r.id=i.return_id WHERE i.order_item_id=oi.id AND r.status='Pending'),0) THEN RAISE EXCEPTION 'Return quantity exceeds the unreturned quantity.'; END IF;
   INSERT INTO return_items(return_id,order_item_id,product_id,quantity,condition) VALUES(rid,oi.id,oi.product_id,qty,item->>'condition'); END LOOP;
 ELSIF resource='returns' AND op IN ('approve','reject') THEN
  SELECT * INTO ret FROM returns WHERE id=rid; IF ret.status<>'Pending' THEN RAISE EXCEPTION 'Only pending returns can be reviewed.'; END IF;
  IF op='reject' THEN IF why IS NULL THEN RAISE EXCEPTION 'A rejection reason is required.'; END IF; UPDATE returns SET status='Rejected',rejected_at=now(),reject_reason=why WHERE id=rid;
  ELSE FOR ln IN SELECT * FROM return_items WHERE return_id=rid LOOP
   UPDATE order_items SET returned_qty=returned_qty+ln.quantity WHERE id=ln.order_item_id;
   IF ln.condition='Good' THEN PERFORM stock_service(ln.product_id,ln.quantity,'ReturnIn',resource,rid,ret.return_no,ret.return_date,ret.reason); END IF; END LOOP;
   UPDATE returns SET status='Approved',approved_at=now() WHERE id=rid; END IF;
 ELSIF resource='stock-adjustments' AND op='create' THEN
  p:=active_product(pid); IF b ? 'previous_quantity' AND p.current_stock<>(b->>'previous_quantity')::int THEN RAISE EXCEPTION 'Stock changed. Check the current balance again.'; END IF;
  qty:=(b->>'new_quantity')::int-p.current_stock; IF qty=0 THEN RAISE EXCEPTION 'The counted quantity already matches the balance.'; END IF;
  ref:=next_reference('ADJ'); INSERT INTO stock_adjustments(reference_no,product_id,previous_quantity,new_quantity,reason,adjustment_date,notes) VALUES(ref,pid,p.current_stock,p.current_stock+qty,why,day,b->>'notes') RETURNING id INTO rid;
  PERFORM stock_service(pid,qty,CASE WHEN qty>0 THEN 'AdjustmentIn' ELSE 'AdjustmentOut' END,resource,rid,ref,day,why);
 ELSIF op='image' AND resource='products' THEN UPDATE products SET image_path=b->>'path',updated_at=now() WHERE id=rid;
 ELSIF op='logo' AND resource='settings' THEN UPDATE system_settings SET logo_path=b->>'path',updated_at=now() WHERE id=1;
 ELSIF resource='settings' AND op='update' THEN
  IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=b->>'time_zone') THEN RAISE EXCEPTION 'Choose a valid IANA time zone.'; END IF;
  IF nullif(trim(b->>'system_name'),'') IS NULL OR nullif(trim(b->>'company_name'),'') IS NULL THEN RAISE EXCEPTION 'System and company names are required.'; END IF;
  UPDATE system_settings SET system_name=trim(b->>'system_name'),company_name=trim(b->>'company_name'),company_address=b->>'company_address',company_phone=b->>'company_phone',company_email=b->>'company_email',currency_code=upper(b->>'currency_code'),currency_symbol=b->>'currency_symbol',date_format=b->>'date_format',time_zone=b->>'time_zone',default_language=b->>'default_language',default_theme=b->>'default_theme',low_stock_threshold=(b->>'low_stock_threshold')::int,session_timeout_minutes=(b->>'session_timeout_minutes')::int,updated_at=now() WHERE id=1;
 ELSE RAISE EXCEPTION 'Unsupported action.'; END IF;
 EXECUTE format('SELECT to_jsonb(t) FROM %I t WHERE id=$1',tab) INTO new_data USING rid;
 ref:=coalesce(ref,new_data->>'reference_no',new_data->>'order_no',new_data->>'return_no',new_data->>'sku');
 label:=coalesce(new_data->>'name',new_data->>'full_name',ref,new_data->>'system_name',resource);
 PERFORM log_event(initcap(op),resource,rid,initcap(op)||' · '||label,ref,old_data,new_data);
 RETURN jsonb_build_object('id',rid,'reference_no',ref);
END $$;
