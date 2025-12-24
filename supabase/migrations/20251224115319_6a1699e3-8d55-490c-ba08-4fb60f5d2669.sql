-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('super_admin', 'sales', 'accounting', 'admin_hr');

-- Create enum for product categories
CREATE TYPE public.product_category AS ENUM ('drapes', 'blinds', 'rugs');

-- Create profiles table for user information
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  mobile_number TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create user_roles table for role management
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE (user_id, role)
);

-- Create inquiry counter table for tracking monthly increments
CREATE TABLE public.inquiry_counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month TEXT UNIQUE NOT NULL, -- Format: YYMM
  counter INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create inquiries table
CREATE TABLE public.inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_number TEXT UNIQUE NOT NULL,
  client_name TEXT NOT NULL,
  architect_id_name TEXT,
  mobile_number TEXT NOT NULL,
  inquiry_date DATE DEFAULT CURRENT_DATE NOT NULL,
  address TEXT NOT NULL,
  sales_person_id UUID REFERENCES auth.users(id) NOT NULL,
  expected_final_date DATE,
  product_category product_category NOT NULL,
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create indexes for performance
CREATE INDEX idx_inquiries_inquiry_number ON public.inquiries(inquiry_number);
CREATE INDEX idx_inquiries_sales_person ON public.inquiries(sales_person_id);
CREATE INDEX idx_inquiries_product_category ON public.inquiries(product_category);
CREATE INDEX idx_inquiries_inquiry_date ON public.inquiries(inquiry_date);
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiry_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;

-- Security definer function to check user role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Function to get user's role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- Function to generate inquiry number
-- Format: SUYYMMXXX (SU + Year(2) + Month(2) + Counter(3))
CREATE OR REPLACE FUNCTION public.generate_inquiry_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_year_month TEXT;
  current_counter INTEGER;
  new_inquiry_number TEXT;
BEGIN
  -- Get current year and month in YYMM format
  current_year_month := TO_CHAR(NOW(), 'YYMM');
  
  -- Insert or update the counter for current month
  INSERT INTO public.inquiry_counters (year_month, counter)
  VALUES (current_year_month, 1)
  ON CONFLICT (year_month) 
  DO UPDATE SET counter = inquiry_counters.counter + 1
  RETURNING counter INTO current_counter;
  
  -- Generate inquiry number: SU + YYMM + 3-digit counter
  new_inquiry_number := 'SU' || current_year_month || LPAD(current_counter::TEXT, 3, '0');
  
  RETURN new_inquiry_number;
END;
$$;

-- RLS Policies for profiles
CREATE POLICY "Users can view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Super admin can insert profiles"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- RLS Policies for user_roles
CREATE POLICY "Users can view all roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Super admin can manage roles"
ON public.user_roles FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

-- RLS Policies for inquiry_counters
CREATE POLICY "Authenticated users can read counters"
ON public.inquiry_counters FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can update counters"
ON public.inquiry_counters FOR ALL
TO authenticated
USING (true);

-- RLS Policies for inquiries
CREATE POLICY "Authenticated users can view inquiries"
ON public.inquiries FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can create inquiries"
ON public.inquiries FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update inquiries"
ON public.inquiries FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin') OR
  public.has_role(auth.uid(), 'admin_hr') OR
  created_by = auth.uid()
);

CREATE POLICY "Super admin can delete inquiries"
ON public.inquiries FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

-- Trigger to create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, mobile_number)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'name', NEW.email),
    NEW.email,
    NEW.raw_user_meta_data ->> 'mobile_number'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_inquiries_updated_at
  BEFORE UPDATE ON public.inquiries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();