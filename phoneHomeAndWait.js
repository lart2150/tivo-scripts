'use strict'
import {Tivo} from './lib/tivo.js';
import {config} from './config.js';

const doit = async () => {
    const tivo = new Tivo(config.ip, config.mak);
    await tivo.connect();
    console.log('connected');
    
    const etPhoneHome = await tivo.phoneHome();

    let phoneHomeStatus = {};
    do {
        await new Promise(resolve => setTimeout(resolve, 4000));
        try {
            phoneHomeStatus = await tivo.phoneHomeStatus();
            console.log((new Date()).toLocaleTimeString('en-US') + `: ${phoneHomeStatus.phase} - ${phoneHomeStatus.status}`)
        } catch (e) {
            console.log('sad face', e)
        }
    } while (phoneHomeStatus.phase !== 'succeeded');
    tivo.disconnect();
}

doit();