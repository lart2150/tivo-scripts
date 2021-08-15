'use strict'
import {Tivo} from './lib/tivo.js';
import {config} from './config.js';

const doit = async () => {
    const tivo = new Tivo(config.ip, config.mak);
    await tivo.connect();
    console.log('connected');
    
    const configInfo = await tivo.configSearch();
    const tunerState = await tivo.tunerState();
    const whatsOn = await tivo.whatsOn();
    const systemInformation = await tivo.systemInformation();
    console.log(configInfo);
    console.log(tunerState);
    console.log(whatsOn);
    console.log(systemInformation);
    
    tivo.disconnect();
}

doit();