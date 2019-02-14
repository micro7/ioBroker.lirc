/**
 *
 * lirc adapter
 *
 *
 *  file io-package.json comments:
 *
 *  {
 *      "common": {
 *          "name":         "lirc",                  // name has to be set and has to be equal to adapters folder name and main file name excluding extension
 *          "version":      "0.1.0",                    // use "Semantic Versioning"! see http://semver.org/
 *          "title":        "Node.js lirc Adapter",  // Adapter title shown in User Interfaces
 *          "authors":  [                               // Array of authord
 *              "Daniel Lenz <dev@daniellenz.eu>"
 *          ]
 *          "desc":         "lirc adapter",          // Adapter description shown in User Interfaces. Can be a language object {de:"...",ru:"..."} or a string
 *          "platform":     "Javascript/Node.js",       // possible values "javascript", "javascript/Node.js" - more coming
 *          "mode":         "daemon",                   // possible values "daemon", "schedule", "subscribe"
 *          "materialize":  true,                       // support of admin3
 *          "schedule":     "0 0 * * *"                 // cron-style schedule. Only needed if mode=schedule
 *          "loglevel":     "info"                      // Adapters Log Level
 *      },
 *      "native": {                                     // the native object is available via adapter.config in your adapters code - use it for configuration
 *          "ip": '192.0.0.1',
 *          "port": 8765,
 *          "recon": 5000
 *      }
 *  }
 *
 */

/* jshint -W097 */ // jshint strict:false
/*jslint node: true */
'use strict';

const utils = require(__dirname + '/lib/utils'); // Get common adapter utils

const adapter = new utils.Adapter('lirc');

//define lirc
let lirc;

//init lirc 
function initLirc(ipaddr, port, recon) {
	adapter.log.info('config ip: ' + adapter.config.ip);
	adapter.log.info('config port: ' + adapter.config.port);
	adapter.log.info('config reconnect interval (in ms): ' + adapter.config.reconnect);

	lirc = require('lirc-client')({
		host: ipaddr, //default: 127.0.0.1
		port: port, //default: 8765,
		reconnect: recon //default: 5000
	});
	lirc.on('error', function(err) {
		if (err.includes('connect ECONNREFUSED')) {
			adapter.log.error(err + ": Please check configuration of IP address and port.")
		} else {
			if (err == "end") {
				lirc.close;
				adapter.log.error('Connection lost');
			}
			else {
				adapter.log.error('Connection error:' + err);
			}
		}
	});
	lirc.on('connect', function() {
		//get Lirc-Version
			lirc.cmd('VERSION', function (versErr, versRes) {
				if (versErr) {
					adapter.log.error('Error retrieving LIRC Version:' + versErr);
				}
				else {
			        adapter.log.debug('LIRC Version', versRes);
				}
			    });
		//create list object per instance
		adapter.setObject('LIST', {
			type: 'state',
			common: {
				name: 'LIST',
				type: 'string',
				role: 'value'
			},
			native: {}
		});
		//get and create remotes as channels
		requestDevices();
	});

	//update states if key has been received from lirc
	lirc.on('receive', function(remote, button, repeat) {
		adapter.log.debug('button ' + button + ' on remote ' + remote + ' was pressed ' + repeat + ' times!');
		adapter.setState(remote + '.SEND_ONCE.' + button, 1, true);
		adapter.setState(remote + '.SEND_ONCE-repeat.' + button, repeat, true);
		adapter.setState(remote + '.SEND_ONCE.KEY', button, true);
		adapter.setState(remote + '.SEND_ONCE-repeat.KEY', button + '#' + repeat, true);

	});
}

function requestDevices() {
	lirc.cmd('LIST', function(listErr, listRes) {
		if (listRes) {
			let devices = String(listRes).split(',');
			adapter.log.debug('Devices: ' + devices);

			//Delete no longer given device objects
			adapter.getDevices(function(devErr, devObj) {
				if (devErr) {
					adapter.log.error(devErr);
				} else {
					if (devObj) {
						for (let k = 0; k < devObj.length; k++) {
							if (devObj[k]._id) {
								let dev = String(devObj[k]._id).split('.')[2];
								if (devices.indexOf(dev) > -1) {
									//adapter.log.debug(dev + ' still in list');
								} else {
									adapter.log.debug(devObj[k].common.name + ' to be deleted');
									adapter.deleteDevice(dev, function(delDevErr, delDevRes) {
										if (delDevErr) {
											adapter.log.error('Device not deleted.' + delDevErr);
										} else {
											adapter.log.debug('Device ' + dev + ' deleted.');
										}
									});
								}
							}
						}
					}
				}
			});

			//Create given devices
			for (let i = 0; i < devices.length; i++) {
				adapter.setObjectNotExists(devices[i], {
					type: 'device',
					common: {
						name: devices[i],
						role: 'device'
					},
					native: {}
				});
				adapter.setObjectNotExists(devices[i] + '.SEND_ONCE', {
					type: 'channel',
					common: {
						name: devices[i] + '.SEND_ONCE',
						role: 'channel'
					},
					native: {}
				});
				adapter.setObjectNotExists(devices[i] + '.SEND_ONCE-repeat', {
					type: 'channel',
					common: {
						name: devices[i] + '.SEND_ONCE-repeat',
						role: 'channel'
					},
					native: {}
				});
				adapter.setObjectNotExists(devices[i] + '.SEND_START', {
					type: 'channel',
					common: {
						name: devices[i] + '.SEND_START',
						role: 'channel'
					},
					native: {}
				});
				adapter.setObjectNotExists(devices[i] + '.SEND_STOP', {
					type: 'channel',
					common: {
						name: devices[i] + '.SEND_STOP',
						role: 'channel'
					},
					native: {}
				});
				
				updateKeys(devices[i]);
			}
		} //end of res
	});
}

function updateKeys(device) {
	//get and create keys of remote as states
	lirc.cmd('LIST ' + device, function(keysErr, keysRes) {
		if (keysRes) {

			let keys = String(keysRes).split(',');

			//delete no longer given objects
			adapter.getStatesOf(device, "SEND_ONCE", function(butErr, butRes) {
				if (butErr) {
					adapter.log.error(butErr);
				} else {
					for (let k = 0; k < butRes.length; k++) {
						if (butRes[k]._id) {
							let key = String(butRes[k]._id).split('.')[4];
							if (keys.indexOf(key) > -1) {
							} else {				
								adapter.log.debug(device + " " + key + ' to be deleted');				
								if (key != "KEY") {
									adapter.deleteState(device, 'SEND_ONCE', key, function(delButErr, delButRes) {
										if (delButErr) {
											adapter.log.error('SEND_ONCE ' + key + ' not deleted.' + delButErr);
										} else {
											adapter.log.debug('SEND_ONCE ' + key + ' deleted.');
										}
									});
									adapter.deleteState(device, 'SEND_ONCE-repeat', key, function(delRepErr, delRepRes) {
										if (delRepErr) {
											adapter.log.error('SEND_ONCE-repeat ' + key + ' not deleted.' + delRepErr);
										} else {
											adapter.log.debug('SEND_ONCE-repeat ' + key + ' deleted.');
										}
									});
								}
							}
						}
					}
				}
			});

			//create state objects/buttons
			for (let j = 0; j < keys.length; j++) {
				keys[j] = keys[j].split(" ")[1];
				adapter.setObjectNotExists(device + '.SEND_ONCE.' + keys[j], {
					type: 'state',
					common: {
						name: device + '.SEND_ONCE.' + keys[j],
						type: 'boolean',
						role: 'button'
					},
					native: {}
				});
				adapter.setObjectNotExists(device + '.SEND_ONCE-repeat.' + keys[j], {
					type: 'state',
					common: {
						name: device + '.SEND_ONCE-repeat.' + keys[j],
						type: 'string',
						role: 'value'
					},
					native: {}
				});
			}
			//create a generic key state
			adapter.setObjectNotExists(device + '.SEND_ONCE.KEY', {
				type: 'state',
				common: {
					name: device + '.SEND_ONCE.KEY',
					type: 'string',
					role: 'value'
				},
				native: {}
			});
			adapter.setObjectNotExists(device + '.SEND_ONCE-repeat.KEY', {
				type: 'state',
				common: {
					name: device + '.SEND_ONCE-repeat.KEY',
					type: 'string',
					role: 'value'
				},
				native: {}
			});
			adapter.setObjectNotExists(device + '.SEND_START.KEY', {
				type: 'state',
				common: {
					name: device + '.SEND_START.KEY',
					type: 'string',
					role: 'value'
				},
				native: {}
			});
			adapter.setObjectNotExists(device + '.SEND_STOP.KEY', {
				type: 'state',
				common: {
					name: device + '.SEND_STOP.KEY',
					type: 'string',
					role: 'value'
				},
				native: {}
			});

		}
	});

}

adapter.on('unload', function(callback) {
	try {
		lirc.close();
		adapter.log.info('cleaned everything up...');
		callback();
	} catch (e) {
		callback();
	}
});

// is called if a subscribed object changes
adapter.on('objectChange', function(id, obj) {
	// Warning, obj can be null if it was deleted
	adapter.log.debug('objectChange ' + id + ' ' + JSON.stringify(obj));
});

//send command to lirc if state changed
adapter.on('stateChange', function(id, state) {
	adapter.log.debug('stateChange ' + id + ' ' + JSON.stringify(state));

	if (state && !state.ack) {
		adapter.log.debug('ack is not set!');
		id = id.substring(adapter.namespace.length + 1);
		let idArr = id.split('.');
		
		if (idArr[0] === 'LIST') {
			//LIST string changed - LIST value_at_LIST (empty string --> list of remotes, or remoteName --> list of keys)
			lirc.cmd('LIST ' + state.val, function(sendListErr, sendListRes) {
				if (sendListErr) {
					adapter.log.error('Send LIST error: ' + sendListErr);
				}
				if (sendListRes) {
					//update state of LIST object with remoteNames or keyNames
					adapter.setState('LIST', JSON.stringify(sendListRes), true);
				}
			});
		}
		else{
			switch(idArr[1]){
			case "SEND_ONCE-repeat":
				//key with dynamic repeat value - separated by # - in state changed - custom string / value object - SEND_ONCE remoteName keyName repeat#
				if (idArr[2] == "KEY") {
					lirc.cmd('SEND_ONCE', idArr[0], state.val.substring(0,state.val.indexOf("#")), state.val.substring(state.val.indexOf("#")+1), function(sendKeyErr, sendKeyRes) {
						if (sendKeyErr) {
							adapter.log.error('Send KEY error: ' + sendKeyErr);
						}
						if (sendKeyRes) {
							adapter.log.debug('Send KEY response: ' + sendKeyRes);
						}
					});	
				}
				else {
					
					lirc.cmd('SEND_ONCE', idArr[0], idArr[2], state.val, function(sendRepErr, sendRepRes) {
					if (sendRepErr) {
						adapter.log.error('Send repeat error: ' + sendRepErr);
					}
					if (sendRepRes) {
						adapter.log.debug('Send repeat response: ' + sendRepRes);
					}
				});
			}
				break;
			default: //SEND_ONCE, SEND_START or SEND_STOP
				if (state.val === true) {
					//button changed - default boolean object - SEND_???? remoteName keyName
					lirc.cmd(idArr[1], idArr[0], idArr[2], function(sendButErr, sendButRes) {
						if (sendButErr) {
							adapter.log.error('Sending button error: ' + id + '. ' + sendButErr);
						}
						if (sendButRes) {
							adapter.log.debug('Send button response: ' + sendButRes);
						}
					});
				} else {
					//KEY object changed - SEND_???? remoteName value_at_KEY (i.e. KEY_POWER)
					lirc.cmd(idArr[1], idArr[0], state.val, function(sendKeyErr, sendKeyRes) {
						if (sendKeyErr) {
							adapter.log.error('Send KEY error: ' + sendKeyErr);
						}
						if (sendKeyRes) {
							adapter.log.debug('Send KEY response: ' + sendKeyRes);
						}
					});
				}
			}
		} 
	}
});

// Some message was sent to adapter instance over message box. Used by email, pushover, text2speech, ...
adapter.on('message', function(obj) {
	if (typeof obj === 'object' && obj.message) {
		if (obj.command === 'RequestDevices_Msg') {
			// e.g. send email or pushover or whatever
			adapter.log.debug('requestDevices command');

			// Send response in callback if required
			if (obj.callback) adapter.sendTo(obj.from, obj.command, 'Message received', obj.callback);
		}
	}
});

adapter.on('ready', function() {
	main();
});

function main() {
	adapter.subscribeStates('*');
	if (adapter.config) initLirc(adapter.config.ip, adapter.config.port, adapter.config.reconnect);
}
