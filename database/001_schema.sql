-- Shared PostgreSQL contract. Run once through the EF migration (or private preview).
CREATE TABLE admin_users (
 id int PRIMARY KEY CHECK(id=1), username varchar(50) NOT NULL UNIQUE, full_name varchar(100) NOT NULL,
 password_hash text NOT NULL, recovery_key_hash text, must_change_password boolean NOT NULL DEFAULT true,
 failed_login_count int NOT NULL DEFAULT 0, locked_until timestamptz, last_login_at timestamptz,
 password_changed_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE refresh_tokens (
 id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY, admin_id int NOT NULL REFERENCES admin_users ON DELETE RESTRICT,
 session_id uuid NOT NULL, token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, last_seen timestamptz NOT NULL DEFAULT now(),
 created_ip text, revoked_at timestamptz, replaced_by_id int REFERENCES refresh_tokens ON DELETE RESTRICT, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON refresh_tokens(session_id);
CREATE TABLE system_settings (
 id int PRIMARY KEY CHECK(id=1), system_name varchar(80) NOT NULL, company_name varchar(120) NOT NULL,
 company_address varchar(300), company_phone varchar(32), company_email varchar(120), logo_path varchar(180),
 currency_code varchar(3) NOT NULL CHECK(currency_code ~ '^[A-Z]{3}$'), currency_symbol varchar(8) NOT NULL,
 date_format text NOT NULL CHECK(date_format IN ('YYYY-MM-DD','DD/MM/YYYY','MM/DD/YYYY')), time_zone varchar(80) NOT NULL,
 default_language text NOT NULL CHECK(default_language IN ('en','so')), default_theme text NOT NULL CHECK(default_theme IN ('light','dark')),
 low_stock_threshold int NOT NULL CHECK(low_stock_threshold>=0), session_timeout_minutes int NOT NULL CHECK(session_timeout_minutes BETWEEN 5 AND 720), updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO system_settings(id,system_name,company_name,currency_code,currency_symbol,date_format,time_zone,default_language,default_theme,low_stock_threshold,session_timeout_minutes)
VALUES(1,'Stockroom','My warehouse','USD','$','YYYY-MM-DD','Africa/Mogadishu','en','light',10,60);
CREATE TABLE reference_counters(prefix text NOT NULL, year int NOT NULL, last_number int NOT NULL, PRIMARY KEY(prefix,year));
CREATE TABLE categories (
 id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name varchar(100) NOT NULL CHECK(trim(name)<>''), description text,
 is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ON categories(lower(name));
CREATE TABLE products (
 id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY, sku varchar(50) NOT NULL CHECK(trim(sku)<>''), name varchar(200) NOT NULL CHECK(trim(name)<>''), description text,
 category_id int REFERENCES categories ON DELETE RESTRICT, image_path text, selling_price numeric(18,2) NOT NULL CHECK(selling_price>=0),
 current_stock int NOT NULL DEFAULT 0 CHECK(current_stock>=0), low_stock_threshold int CHECK(low_stock_threshold>=0),
 is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ON products(lower(sku)); CREATE INDEX ON products(lower(name)); CREATE INDEX ON products(category_id);
CREATE TABLE customers (
 id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY, full_name varchar(200) NOT NULL CHECK(trim(full_name)<>''), phone varchar(32) UNIQUE, email varchar(120), gender text CHECK(gender IN ('Male','Female','Other')),
 location varchar(200), notes text, is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON customers(lower(full_name));
CREATE TABLE stock_ins (
 id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY, reference_no text UNIQUE NOT NULL, received_date date NOT NULL,
 source_name varchar(200), external_ref varchar(100), notes text, status text NOT NULL DEFAULT 'Completed' CHECK(status IN ('Completed','Reversed')),
 reversed_at timestamptz, reversal_reason text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE stock_in_items (
 id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY, stock_in_id int NOT NULL REFERENCES stock_ins ON DELETE RESTRICT,
 product_id int NOT NULL REFERENCES products ON DELETE RESTRICT, quantity int NOT NULL CHECK(quantity>0), UNIQUE(stock_in_id,product_id)
);
CREATE TABLE stock_outs (
 id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY, reference_no text UNIQUE NOT NULL, type text NOT NULL CHECK(type IN ('Sample','Gift')),
 product_id int NOT NULL REFERENCES products ON DELETE RESTRICT, quantity int NOT NULL CHECK(quantity>0), recipient_name varchar(200) NOT NULL CHECK(trim(recipient_name)<>''),
 reason text NOT NULL CHECK(trim(reason)<>''), out_date date NOT NULL, notes text, status text NOT NULL DEFAULT 'Completed' CHECK(status IN ('Completed','Reversed')),
 reversed_at timestamptz, reversal_reason text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE orders (
 id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY, order_no text NOT NULL UNIQUE, customer_type text NOT NULL CHECK(customer_type IN ('Registered','Cash')),
 customer_id int REFERENCES customers ON DELETE RESTRICT, cash_customer_name varchar(200), cash_customer_phone varchar(32), order_date date NOT NULL,
 status text NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Confirmed','Delivered','Cancelled')), total_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK(total_amount>=0),
 notes text, confirmed_at timestamptz, delivered_at timestamptz, cancelled_at timestamptz, cancel_reason text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((customer_type='Registered') = (customer_id IS NOT NULL))
);
CREATE TABLE order_items (
 id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY, order_id int NOT NULL REFERENCES orders ON DELETE RESTRICT, product_id int NOT NULL REFERENCES products ON DELETE RESTRICT,
 quantity int NOT NULL CHECK(quantity>0), unit_price numeric(18,2) NOT NULL CHECK(unit_price>=0), line_total numeric(18,2) GENERATED ALWAYS AS(quantity*unit_price) STORED,
 returned_qty int NOT NULL DEFAULT 0 CHECK(returned_qty BETWEEN 0 AND quantity), UNIQUE(order_id,product_id)
);
CREATE TABLE returns (
 id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY, return_no text UNIQUE NOT NULL, order_id int NOT NULL REFERENCES orders ON DELETE RESTRICT, return_date date NOT NULL,
 reason text NOT NULL CHECK(trim(reason)<>''), status text NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Approved','Rejected')), notes text,
 approved_at timestamptz, rejected_at timestamptz, reject_reason text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE return_items (
 id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY, return_id int NOT NULL REFERENCES returns ON DELETE RESTRICT,
 order_item_id int NOT NULL REFERENCES order_items ON DELETE RESTRICT, product_id int NOT NULL REFERENCES products ON DELETE RESTRICT,
 quantity int NOT NULL CHECK(quantity>0), condition text NOT NULL CHECK(condition IN ('Good','Damaged')), notes text,
 UNIQUE(return_id,order_item_id,condition)
);
CREATE TABLE stock_adjustments (
 id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY, reference_no text UNIQUE NOT NULL, product_id int NOT NULL REFERENCES products ON DELETE RESTRICT,
 previous_quantity int NOT NULL, new_quantity int NOT NULL CHECK(new_quantity>=0), difference int GENERATED ALWAYS AS(new_quantity-previous_quantity) STORED,
 reason text NOT NULL CHECK(trim(reason)<>''), adjustment_date date NOT NULL, notes text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE stock_movements (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, product_id int NOT NULL REFERENCES products ON DELETE RESTRICT, movement_type text NOT NULL,
 quantity int NOT NULL CHECK(quantity<>0), stock_before int NOT NULL CHECK(stock_before>=0), stock_after int NOT NULL CHECK(stock_after=stock_before+quantity AND stock_after>=0),
 source_type text NOT NULL, source_id int NOT NULL, reference_no text NOT NULL, occurred_at date NOT NULL, notes text, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source_type,source_id,product_id,movement_type)
);
CREATE TABLE audit_logs (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, admin_id int REFERENCES admin_users ON DELETE RESTRICT, action text NOT NULL, entity_type text NOT NULL,
 entity_id int, reference_no text, description text NOT NULL, old_values jsonb, new_values jsonb, ip_address text, user_agent text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE backups (
 id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY, file_name text NOT NULL, file_path text NOT NULL, file_size bigint, checksum_sha256 text,
 type text NOT NULL CHECK(type IN ('Manual','PreRestore')), status text NOT NULL CHECK(status IN ('InProgress','Completed','Failed')), verified_at timestamptz,
 started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, error_message text
);
CREATE TABLE restore_logs (
 id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY, backup_id int NOT NULL REFERENCES backups ON DELETE RESTRICT, status text NOT NULL,
 started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, error_message text
);
CREATE INDEX ON stock_ins(received_date); CREATE INDEX ON stock_in_items(product_id); CREATE INDEX ON stock_outs(out_date); CREATE INDEX ON stock_outs(product_id);
CREATE INDEX ON orders(customer_id); CREATE INDEX ON orders(status,order_date); CREATE INDEX ON order_items(product_id); CREATE INDEX ON returns(order_id); CREATE INDEX ON returns(return_date);
CREATE INDEX ON return_items(order_item_id); CREATE INDEX ON stock_adjustments(product_id,adjustment_date); CREATE INDEX ON stock_movements(product_id,occurred_at);
CREATE INDEX ON audit_logs(created_at); CREATE INDEX ON audit_logs(entity_type,entity_id); CREATE INDEX ON audit_logs(action);
CREATE FUNCTION forbid_edits() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'This ledger is append-only'; END $$;
CREATE TRIGGER immutable_movements BEFORE UPDATE OR DELETE OR TRUNCATE ON stock_movements FOR EACH STATEMENT EXECUTE FUNCTION forbid_edits();
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_logs FOR EACH STATEMENT EXECUTE FUNCTION forbid_edits();
