/*
*	Guarda el token del usuario actual
*   
*   Se encarga de las operaciones de login, relogin y logout
*   Realiza el get de los resultados    
*  SINGLETON
*/
define([
 	'jquery',
 	'underscore',
 	'backbone',
 	'localstorage',
 	'collections/Usuarios'
], function ($,_,Backbone,Store,Usuarios) {	

    var sesionModel = Backbone.Model.extend({
        
        defaults:{
        	id: 'unic',
        	logueado: false,
        	userID: -1,
        	username: "",
        	token: ""
        },

        urls: {
        	//login: 'http://iaca3.web.vianetcon.com.ar/ws.json!login!',
        	//login: 'http://localhost/iaca/iaca-www/proxy_login.php?',
            login: 'proxy_login.php?',
        	//results: 'http://iaca3.web.vianetcon.com.ar/ws.json!list-results!'
        	//results: 'http://localhost/iaca/iaca-www/proxy_results.php?',
            results: 'proxy_results.php?'
        },

        localStorage: new Store('iaca-session'),

        initialize: function() {
            
        	console.log("Initialize Sesion");
        	_.bindAll(this,'getAuth','login','crearUsuario','setUsuario',"relogin");
            var self = this;

            if(localStorage.getItem('iaca-session-unic')) {
        		console.log("Init: Fetch sesion")
        		this.fetch({
                    success: function(){
                        if(self.get("logueado"))
                            self.relogin({success: function() {
                                console.log("Relogin inicial - Redirecciono a home");
                                Backbone.history.navigate(self.redireccion,true);
                            }});
                    }
                });	

        	}
        	else {
        		console.log("Init: Save sesion")
        		this.save();
        	};
        },

        login: function(user,pass,callback) {
        	var self = this;
            if(this.get("logueado")) {    
                this.logout();
            }
        	this.getAuth(user,pass,{
        		success: function(data) {
                    console.log("Login OK");
        			self.setUsuario(user,pass,data);
        			if (callback && 'success' in callback) {
        				callback.success(data);
        			}
        		},
        		error: function(error) {
        			console.log('Error: ' + error);
        			console.log("CantLogin");
        			self.logout();
        			if (callback && 'error' in callback) {
        				callback.error(error);
        			}
        		},
        		complete: function() {
        			if (callback && 'complete' in callback) {
        				callback.complete();
        			}
        		}
        	});
        },

        relogin: function(callback) {
            console.log("Relogin");
            var userGuardado = Usuarios.get(this.get("userID"));
            if(userGuardado) {
                this.login(userGuardado.get("id"),userGuardado.get("pass"),callback);
            }
        },



        getAuth: function(user,pass,callback) {
        	var self = this;
        	$.ajax({
        		url: this.urls.login+"username="+user+"&password="+pass,
        		dataType: 'json',
        		type: 'GET'
        	}).done(function(data, textStatus, jqXHR){
        		console.log(data);
        		if(data.result && data.name != null) {
        			if (callback && 'success' in callback) {
        				callback.success(data);
        			}
        		}
        		else if (data.result && data.name==null) {
        			callback.error('Usuario inválido');
        		}	
        		else {
        			if (callback && 'error' in callback) {
        				switch(data.errorcode) {
        					case 1: 
        						callback.error('Usuario o clave inválidos');
        						break;
        					case -1: 
        						callback.error('Ocurrió un error en la base de datos. Intente de nuevo.')	
        						break;
        					default:
        						callback.error("Error desconocido. Intente de nuevo.")	
        				}
        			} 
        		}
        	}).fail(function( jqXHR, textStatus, errorThrown ) {
        		console.log(jqXHR + textStatus + errorThrown);
        		if (callback && 'error' in callback) {
        			callback.error('No se pudo comunicar con el servidor. Intente de nuevo');
        		} 
        	}).always(function(){
        		if (callback && 'complete' in callback) {
        			callback.complete();
        		}
        	});
        },

        setUsuario: function(id,pass,data) {
			
			//Si no existe el usuario, lo creo
			if(!Usuarios.get(id))
				this.crearUsuario(id,data.name,pass);
            else {
                console.log("El usuario ya existe en la coleccion");
            }
			console.log("Set usuario logueado: "+id+" "+data.name+" ,token: "+data.token);
			this.set("userID",id);
			this.set("username",data.name);
			this.set("token",data.token);
			this.set("logueado",true);
        	this.save();
        },

        logout: function() {
        	this.set("token","");
        	this.set("userID",-1);
			this.set("username","");
			this.set("logueado",false);
        	this.save();
        	console.log("Logueado: "+false);
        },

        crearUsuario: function(id,name,pass) {
            console.log("Creo usuario id:"+id);
            Usuarios.create({id: id, name: name, pass: pass})
        },

        reintentoResultados: false, // para controlar un solo reintento

        getResultados: function(callback) {
            var token = this.get("token");
            var self = this;
            console.log("Obtener lista resultados... Token: "+token+" Reintento: "+this.reintentoResultados);
            // if token mayor a 30 minutos 
            //  relogin
            //else
            $.ajax({
                url: this.urls.results+"token="+token,
                dataType: 'json',
                type: 'GET'
            }).done(function(data, textStatus, jqXHR){
                console.log(data);
                if(data.result) {
                    console.log("Get Resultados OK");
                    if (callback && 'success' in callback) {
                        callback.success(data);
                        self.reintentoResultados = false;
                    }
                }
                else {
                    console.log("Get resultados - Errorcode: "+data.errorcode)
                    if(data.errorcode == 2 && !self.reintentoResultados) {
                        self.reintentoResultados = true;
                        console.log("Reintento obtener resultados...");
                        self.relogin({complete: function() {
                            console.log("Vuelvo a obtener resultados...");
                            self.getResultados(callback);
                        }});
                    }
                    else {
                        if (callback && 'error' in callback) {
                            callback.error("No se pueden obtener los resultados");
                            self.reintentoResultados = false;
                        }
                    }
                }
            }).fail(function( jqXHR, textStatus, errorThrown ) {
                console.log(jqXHR + textStatus + errorThrown);
                if (callback && 'error' in callback) {
                    callback.error('No se pudo comunicar con el servidor. Intente de nuevo');
                    self.reintentoResultados = false;
                } 
            }).always(function(){
                if (callback && 'complete' in callback) {
                    callback.complete();
                }
            });


        }

        

    });
    return new sesionModel;

});
