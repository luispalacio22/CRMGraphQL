const Usuario= require('../models/Usuario');
const Producto=require('../models/Producto');
const Cliente=require('../models/Cliente');
const Pedido=require('../models/Pedido');

const bcryptjs = require('bcryptjs');
const jwt= require('jsonwebtoken');
require('dotenv').config({path: 'variables.env'});

const crearToken=(usuario,secreta,expiresIn)=>{
    const {nombre,apellido,id,email}=usuario;

    return jwt.sign({id,nombre,apellido,email},secreta,{expiresIn})
}
//Resolvers
const resolvers={
    Query:{
       obtenerUsuario: async(_,{},ctx)=>{

           return ctx.usuario;
       },
       obtenerProductos:async()=>{
           try {
               const productos=await Producto.find({});
               return productos;
           } catch (error) {
               console.log(error)
               
           }
       },
       obtenerProducto:async(_,{id})=>{
           const producto=await Producto.findById(id);
           if(!producto){
               throw new Error('Producto no encontrado');
           }
           return producto;
       },
       obtenerClientes:async()=>{
           try {
               const clientes=await Cliente.find({});
               return clientes;
           } catch (error) {
               console.log(error);
           }
       },
       obtenerClientesVendedor:async(_,{},ctx)=>{
            try {
                const clientes=await Cliente.find({vendedor: ctx.usuario.id.toString()});
                return clientes;
            } catch (error) {
                console.log(error);
            }
       },
       obtenerCliente:async(_,{id},ctx)=>{
           //Verificar si existe el cliente
        const cliente=await Cliente.findById(id);
        if(!cliente){
            throw new Error('Cliente no encontrado')
        }
           //El que lo creo lo puede ver
        if(cliente.vendedor.toString()!==ctx.usuario.id){
            throw new Error('No tienes las credenciales');
        }

        return cliente;
       },
       obtenerPedidos:async()=>{
           try {
               const pedidos=await Pedido.find({});
               return pedidos
           } catch (error) {
               console.log(error)
           }
       },
       obtenerPedidosVendedor:async(_,{},ctx)=>{
           try {
               const pedidos=await Pedido.find({vendedor:ctx.usuario.id}).populate('cliente');
               return pedidos;
           } catch (error) {
               console.log(error)
           }

       },
       obtenerPedido:async(_,{id},ctx)=>{
           //Verificar si existe el pedido
           const pedido=await Pedido.findById(id);
           if(!pedido){
               throw new Error('Pedido no encontrado');
           }

           //Solo puede verlo el que lo creo 
           if(pedido.vendedor.toString()!==ctx.usuario.id){
               throw new Error('No tiene las credenciales');
           }

           //Retornar el resultado 
           return pedido;
       },
       obtenerPedidosEstado:async(_,{estado},ctx)=>{
           const pedidos=await Pedido.find({vendedor:ctx.usuario.id,estado:estado});
           return pedidos;
       },
       mejoresClientes:async()=>{
        const clientes = await Pedido.aggregate([
            { $match : { estado : "Completado" } },
            { $group : {
                _id : "$cliente", 
                total: { $sum: '$total' }
            }}, 
            {
                $lookup: {
                    from: 'clientes', 
                    localField: '_id',
                    foreignField: "_id",
                    as: "cliente"
                }
            }, 
            {
                $limit: 10
            }, 
            {
                $sort : { total : -1 }
            }
        ]);

        return clientes;
    }, 
       mejoresVendedores:async()=>{
        const vendedores = await Pedido.aggregate([
            { $match : { estado : "Completado"} },
            { $group : {
                _id : "$vendedor", 
                total: {$sum: '$total'}
            }},
            {
                $lookup: {
                    from: 'usuarios', 
                    localField: '_id',
                    foreignField: '_id',
                    as: 'vendedor'
                }
            }, 
            {
                $limit: 3
            }, 
            {
                $sort: { total : -1 }
            }
        ]);

        return vendedores;
       },
       buscarProducto:async(_,{texto})=>{
           const productos=await Producto.find({$text:{$search:texto}});
           return productos;
       }
    },

    Mutation:{
        nuevoUsuario:async(_,{input})=>{
            const {email,password}=input;
            //Revisar si el usuario esta registrado
            const existeUsuario= await Usuario.findOne({email});
            if(existeUsuario){
                throw new Error('El usuario ya se encuentra registrado')
            }
            //Hashear su password
            const salt=await bcryptjs.genSalt(10);
            input.password=await bcryptjs.hash(password,salt);


            try {
            //Guardarlo en la base de datos 
                const usuario=new Usuario(input);
                usuario.save();//Guardarlo
                return usuario;
            } catch (error) {
                console.log(error)
            }
        },
        autenticarUsuario:async(_,{input})=>{
            const {email,password}=input;

            //Si el usuario existe
            const existeUsuario= await Usuario.findOne({email});
            if(!existeUsuario){
                throw new Error('El usuario no existe');
            }

            //Revisae si el password es correcto 
            const passwordCorrecto=await bcryptjs.compare(password,existeUsuario.password);
            if(!passwordCorrecto){
                throw new Error('Password incorrecto');
            }
            //Crear el token 
            return{
                token: crearToken(existeUsuario,process.env.SECRETA,'24h')
            }
        },

        nuevoProducto:async(_,{input})=>{
            try {
                const producto=new Producto(input);

                //Almacenar en la bd
                const resultado=await producto.save();

                return resultado;
            } catch (error) {
                console.log(error)
            }
        },

        actualizarProducto:async(_,{id,input})=>{
            let producto=await Producto.findById(id);
            if(!producto){
                throw new Error('Producto no encontrado');
            }

            //Guardar en la base de datos actualizado
            producto=await Producto.findOneAndUpdate({_id:id},input,{new:true});
            return producto;
        },

        eliminarProducto:async(_,{id})=>{
            let producto= await Producto.findById(id);
            if(!producto){
                throw new Error('Producto no encontrado')
            }

            await Producto.findByIdAndDelete({_id:id});
            return('Producto eliminado')
        },

        nuevoCliente:async(_,{input},ctx)=>{
            const{email}=input;
            //Verificar si el cliente ya esta creado 
            const cliente=await Cliente.findOne({email});
            if(cliente){
                throw new Error('El cliente ya se encuentra registrado');

            }

            const nuevoCliente=new Cliente(input);
            //Asignar al vendedor
            nuevoCliente.vendedor=ctx.usuario.id;
            //Guardar en la base de datos
            try {
                
                const resultado=await nuevoCliente.save();
                return resultado;
            } catch (error) {
                console.log(error)
            }
            
        },
        actualizarCliente:async(_,{id,input},ctx)=>{
            //Verificar si existe
            let cliente=await Cliente.findById(id);
            if(!cliente){
                throw new Error('No existe el cliente');
            }

            //Verificar el vendedor quien edita
            if(cliente.vendedor.toString()!==ctx.usuario.id){
                throw new Error('No tienes las credenciales');
            }

            //Guardar el cliente
            cliente=await Cliente.findByIdAndUpdate({_id:id},input,{new:true});
            return cliente;
            
        },
        eliminarCliente:async(_,{id},ctx)=>{
            //Verificar si existe
            let cliente=await Cliente.findById(id);
            if(!cliente){
                throw new Error('No existe el cliente');
            }

            //Verificar el vendedor quien edita
            if(cliente.vendedor.toString()!==ctx.usuario.id){
                throw new Error('No tienes las credenciales');
            }

            //Eliminar cliente
            await Cliente.findOneAndDelete({_id:id});
            return('Cliente eliminado')
        },
        nuevoPedido:async(_,{input},ctx)=>{
            const {cliente}=input;
            //Verificar si existe cliente
            let clienteExiste=await Cliente.findById(cliente);
            if(!clienteExiste){
                throw new Error('No se encontro el cliente')
            }
            //verificar si el cliente es del vendedor 
            if(clienteExiste.vendedor.toString()!==ctx.usuario.id){
                throw new Error('No tiene las credenciales');
            }
            //Revisar stock disponible
            for await(const articulo of input.pedido){
                const {id}=articulo;
                const producto=await Producto.findById(id);

                if(articulo.cantidad>producto.existencia){
                    throw new Error( 'el articulo excele la cantidad disponible');
                }else{
                    producto.existencia=producto.existencia-articulo.cantidad;
                    await producto.save();
                }
            }

            //CRear un nuevo pedido
            const nuevoPedido= new Pedido(input);
            //Asignarle un vendedor 
            nuevoPedido.vendedor=ctx.usuario.id;
            //Guardar en la base de datos
            const resultado=await nuevoPedido.save();
            return resultado;
        },
        actualizarPedido:async(_,{id,input},ctx)=>{
            const {cliente}=input;
            //Si el pedido existe
            const existePedido=await Pedido.findById(id);
            if(!existePedido){
                throw new Error('Pedido no encontrado')
            }
            //Si el cliente existe
            const existeCliente=await Cliente.findById(cliente);
            if(!existeCliente){
                throw new Error('Cliente no encontrado');
            }
            //Si el pedido y el vendedor son del vendedor
            if(existeCliente.vendedor.toString()!==ctx.usuario.id){
                throw new Error('No tiene las credenciales');
            }

            //Revisar el stock
            if(input.pedido){
                for await(const articulo of input.pedido){
                    const {id}=articulo;
                    const producto=await Producto.findById(id);
    
                    if(articulo.cantidad>producto.existencia){
                        throw new Error( 'el articulo excele la cantidad disponible');
                    }else{
                        producto.existencia=prducto.existencia-articulo.cantidad;
                        await producto.save();
                    }
                }
            }
            

            //Guardar el pedido
            const resultado=await Pedido.findOneAndUpdate({_id:id},input,{new:true})
            return resultado;
        },
        eliminarPedido:async(_,{id},ctx)=>{
            //Verificar si existe el pedido
            const pedido=await Pedido.findById(id);
            if(!pedido){
                throw new Error('No existe el pedido')
            }

            //Verificar si es el vendedor el que lo borra 
            if(pedido.vendedor.toString()!==ctx.usuario.id){
                throw new Erro('No tiene las credenciales');
            }

            //Eliminar de la base de datos 
            await Pedido.findOneAndDelete({_id:id});
            return 'Pedido eliminado';
        }

    }
}

module.exports=resolvers;