/* global cordova */
define([
	'text!templates/resultados_lista.html',
	'text!templates/alert.html',
	'backbone',
	'services/authentication',
	'services/shift_webservice',
	'collections/Resultados',
	'views/ResultadoItem',
], function (resultadosListaTemplate,alertTemplate,Backbone,Auth,ShiftWS,ResultadosCollection,ResultadoItemView) {

	var ResultadosListaView = Backbone.View.extend({

		//precompilo el template
		template: _.template(resultadosListaTemplate),
		templateAlert: _.template(alertTemplate),

		initialize: function() {
			_.bindAll(this,"render","updateLista","getListaGuardada","renderList","removeItems","verMas","updateLogout");
			this.actualUserID = -1;
			this.actualItem = -1;
			this.$el.html(this.template());

			Auth.on("change:logueado",this.updateLogout,this);
			// Creo scroller para mostrar las imagenes [deshabilitado: no hay más imágenes]
			// this.crearScrollerImgs();

		},
		events: {
			'touchstart #ver-mas' : 	'verMas',
			'touchstart #update' : 'updateUsuario',
			'touchstart #boton-acceso-resultados-anteriores.external-link' : 'openConsultaResultadosAnteriores'
			// 'click #ver-mas' : 	'verMas',
			// 'click #update' : 'updateUsuario',
			// 'click #boton-acceso-resultados-anteriores.external-link' : 'openConsultaResultadosAnteriores'
		},

		render: function() {
			console.log("Render ResultadosListaView");
			//console.log(this.itemsViews);
			this.updateUsuario();
			// El template se renderiza en initialize.

			return this;
		},

		itemsViews: {},

		renderList: function(reset,fin) {
			console.log("Render list...");
			if(reset)
				this.removeItems();
			if (this.resultadosGuardados.length > 0) {
				var ult = this.resultadosGuardados.length-1;
				if(fin && fin < ult)
					ult = fin;
				var pri = this.actualItem +1;
				console.log("Primer item: #"+pri+" Último item: #"+ult);

				//var hayImagenes = false; // El server no entrega más link a imagenes

				for (var i = pri; i <=ult; i++) {
					var result = this.resultadosGuardados.at(i);
					//console.log("Creo view resultado, id: "+result.id);
					var view = new ResultadoItemView({model: result, scrollerImgs: this.scrollerImgs});
					this.$el.find('#lista-resultados').append(view.render().el);
					this.itemsViews[result.id] = view;
					this.actualItem = i;
					// El server no entrega más link a imagenes
					//hayImagenes = hayImagenes || result.get("jpg").length > 0;
				}
				// El server no entrega más link a imagenes - en template no está más link a ver-imagenes
				// if(hayImagenes) {
				// 	this.$el.find('.ver-imagenes').show();
				// }
				// else {
				// 	this.$el.find('.ver-imagenes').hide();
				// }

				// No muestra mensaje de no resultados
				this.$el.find('#no-results').hide();
			}
			else {
				console.log("No hay resultados");
				this.$el.find('#no-results').show();
			}

			if(fin && fin < this.resultadosGuardados.length-1) {
				this.$el.find("#ver-mas-results").show();
			}
			else {
				this.$el.find("#ver-mas-results").hide();
			}

			var self = this;
			setTimeout(function() {
				if(self.scroller)
					self.scroller.refresh();
			}, 1000);

		},
		removeItems: function() {
			console.log("Elimino itemsViews");
			$.each(this.itemsViews, function(index, item) {
				item.remove();
			});
			this.itemsViews = {};
			this.actualItem = -1;
		},

		/*	UPDATE USUARIO
		*	Si se desloguea usuario:
		*		elimina coleccion resultadosGuardados,
		*		remove itemsViews, render sin nombre y redirecciona
		*	Si hay nuevo usuario logueado (cambia actualUserID):
		*		crea coleccion resultadosGuardados
		*		render con nombre, llama a getListaGuardada (fetch de resultadosGuardados),
		*	Si no cambió el usuario
		*		sólo actualiza lista
		*/
		updateUsuario: function() {
			console.log("Update usuario...");
			if(Auth.logueado) {
				var user_id = Auth.getUserId();
				// Si cambio el usuario, creo coleccion y escucho eventos
				if(this.actualUserID != user_id) {
					console.log("Cambió usuario: render ResultadosLista de user "+user_id);
					this.actualUserID = user_id;
					// Crea colección de resultados vacía
					this.resultadosGuardados = new ResultadosCollection([],{userID: user_id});
					//this.listenTo(this.resultadosGuardados, 'add', this.addResultado);
					// ToDo modificar: mostrar nombre usuario luego de hacer el get
					this.$el.find('#nombre-paciente').html(Auth.user.name);
					// Intenta obtener resultados previamente guardados en local storage
					this.getListaGuardada();
				}
				else {
					this.updateLista();
				}
			}
			else {
				this.updateLogout();
			}
		},
		updateLogout: function() {
			if(!Auth.logueado || this.actualUserID != Auth.getUserId()) {
				console.log("Deslogueado - lista resultados vacía");
					//this.stopListening(this.resultadosGuardados);
				this.resultadosGuardados = null;
				this.actualUserID = -1;
				this.removeItems();
				this.$el.find('#nombre-paciente').html("");
			}
		},
		getListaGuardada: function() {
			var self = this;
			console.log("Obtengo resultados guardados...");
			if(this.showing)
				this.loading(true);
			// Intenta obtener resultados guardados en storage (si aún no hay, igual ejecuta callback success)
			this.resultadosGuardados.fetch({
				success: function() {
					self.renderList(true,9); // Renderiza los resultados que estaban guardados
					self.updateLista(); // Hace request al server para obtener resultados
				},
				error: function(collection, response) { // otro param: options
					console.log(response);
				},
				complete: function() {
					self.loading(false);
				}
			});

		},
		updateLista: function() {
			console.log("Actualizo lista de resultados...");
			this.updating(true);
			var self = this;
			try {
				// ToDo rehacer en función al nuevo método de Shift
				ShiftWS.getResultados({
					success: function(data) {
						if(data.list !== null) {
							console.log("Cantidad resultados: "+data.list.length);
							var result = {};
							var hayNuevo = false;  //si no hay nuevo no vuelvo a hacer renderList
							for (var i = data.list.length - 1; i >= 0; i--) {
								var elem = data.list[i];
								// Si en la colecc no está el result de ese protocolo (id) lo creo y guardo en storage
								if(!self.resultadosGuardados.get(elem['protocolo'])) {
									console.log(elem);
									if(typeof elem['jpg'] == 'undefined')
										elem['jpg'] = [];
									// cambio nombres de algunas keys
									_.each(elem, function(value, key) {
									    key = self.mapKeysResultado[key] || key;
									    result[key] = value;
									});
									var fecha = (result['fecha'].replace(/(\d{2})(\d{2})(\d{2})/,'$1-$2-$3'));
									result['fecha'] = fecha;
									console.log("Nuevo resultado: ");
									console.log(result);
									self.resultadosGuardados.create(result);
									hayNuevo = true;
								}
								// Si ya estaba actualizo direccion pdf e imgs
								else {
									self.resultadosGuardados.get(elem['protocolo']).save({
										pdf: elem['pdf'],
										jpg: elem['jpg']
									});
								}
							}
							if(hayNuevo)
								self.renderList(true,9);
						}
					},
					error: function(error) {
						console.log(error);
						if (window.deviceready && window.plugins && window.plugins.toast) {
							window.plugins.toast.showLongCenter(error);
						}
						else {
							self.$el.find('#error-get-results').html(self.templateAlert({msj: error}));
						}
					},
					complete: function() {
						self.updating(false);
						//console.log(self.itemsViews);
						_.each(self.itemsViews, function(item) { // otro param: key
							item.delegateEvents();
						//	console.log("delegateEvents "+item);
						});
					}

				});
			} catch(err) {
				console.log(err);
			}
		},
		mapKeysResultado: {
		    documento: "userID",
		    protocolo: "id"
		},
		loading: function(loading) {

			if(loading) {
				$('#loading-results').show();
			}
			else {
				$('#loading-results').hide();
			}
		},
		updating: function(updating) {
			if(updating) {
				this.$el.find('#updating-results').slideDown('fast');
			}
			else {
				this.$el.find('#updating-results').slideUp('slow');
			}
		},

		verMas: function() {
			this.renderList(false,this.actualItem+10);
		},

		// Abre link para consulta de resultados anteriores en browser
		openConsultaResultadosAnteriores: function(event) {
			var url= ($(event.currentTarget).data('href'));
			if (typeof cordova !== 'undefined' && cordova.InAppBrowser) {
				// Usa plugin inAppBrowser pero abre browser sistema. En Android, con boton back cierra el browser
				// No uso el browser in-app porque no permite descargar PDF
				// 	(y no puedo obtener link de descarga y usar método de lib/PDFDownloader, porque necesito la cookie)
				cordova.InAppBrowser.open(url, '_system');
			}
			else {
				window.open(url,'_system');
			}
		},

		/** Método para mostrar imagenes en un scroller - deshabilitado ya que no hay más img de resultados.
		 *  Requiere dependencia iscroll */
		// crearScrollerImgs: function() {
		// 	$('#close-imgs, #back-imgs').on('touchstart',function() {
		// 		$('#imgs-wrapper').fadeOut();
		// 	});
		// 	if(this.scrollerImgs)
		// 		this.scrollerImgs.destroy();
		// 	this.scrollerImgs = new IScroll('#imgs-wrapper', {
		// 		zoom: true,
		// 		scrollX: true,
		// 		scrollY: true,
		// 		mouseWheel: true,
		// 		wheelAction: 'zoom',
		// 	    scrollbars: true,
		// 	    interactiveScrollbars: true,
		// 		fadeScrollbars: true,
		// 		zoomMin: 0.25
		// 		//zoomMax: 2
		// 	});
		// },
	});

	return ResultadosListaView;
});