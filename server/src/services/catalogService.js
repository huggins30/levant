import { supabase } from '../config/supabase.js';

/**
 * Microservicio de Productos e Inventario (Catalog Service)
 * CRUD de productos para comercios y verificación de inventario con persistencia en Supabase PostgreSQL.
 */
export const catalogService = {
  /**
   * Obtiene los productos activos de un comercio específico.
   * @param {string} comercioId 
   */
  async getProductsByComercio(comercioId) {
    const { data, error } = await supabase
      .from('productos')
      .select('*')
      .eq('comercio_id', comercioId)
      .eq('activo', true)
      .order('nombre', { ascending: true });

    if (error) throw new Error(`Error al consultar catálogo: ${error.message}`);
    return data;
  },

  /**
   * Crea un nuevo producto para un comercio.
   */
  async createProduct(comercioId, productData) {
    const { nombre, descripcion, precio_usd, stock, imagen_url } = productData;

    const { data, error } = await supabase
      .from('productos')
      .insert([
        {
          comercio_id: comercioId,
          nombre,
          descripcion,
          precio_usd,
          stock: stock || 0,
          imagen_url,
          activo: true
        }
      ])
      .select()
      .single();

    if (error) throw new Error(`Error al crear producto: ${error.message}`);
    return data;
  },

  /**
   * Actualiza precio, stock o disponibilidad de un producto.
   */
  async updateProduct(productId, comercioId, updates) {
    const { data, error } = await supabase
      .from('productos')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', productId)
      .eq('comercio_id', comercioId)
      .select()
      .single();

    if (error) throw new Error(`Error al actualizar producto: ${error.message}`);
    return data;
  },

  /**
   * Verifica disponibilidad de inventario para una lista de ítems.
   * @param {Array<{ producto_id: string, cantidad: number }>} items
   */
  async verifyStock(items) {
    const ids = items.map((i) => i.producto_id);
    const { data: productos, error } = await supabase
      .from('productos')
      .select('id, nombre, stock, precio_usd, activo')
      .in('id', ids);

    if (error) throw new Error(`Error al verificar stock: ${error.message}`);

    const stockMap = new Map(productos.map((p) => [p.id, p]));
    const insumosFaltantes = [];

    for (const item of items) {
      const prod = stockMap.get(item.producto_id);
      if (!prod || !prod.activo || prod.stock < item.cantidad) {
        insumosFaltantes.push({
          producto_id: item.producto_id,
          nombre: prod ? prod.nombre : 'Producto no encontrado',
          solicitado: item.cantidad,
          disponible: prod ? prod.stock : 0
        });
      }
    }

    return {
      isValid: insumosFaltantes.length === 0,
      faltantes: insumosFaltantes,
      productosDisponibles: productos
    };
  }
};
