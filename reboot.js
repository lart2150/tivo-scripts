import {Tivo} from './lib/tivo.js'
import {config} from './config.js';

const doit = async () => {
    const tivo = new Tivo(config.ip, config.mak);
    await tivo.connect();
    console.log('connected');
    
    await tivo.reboot();
    
    tivo.disconnect();
}

doit();