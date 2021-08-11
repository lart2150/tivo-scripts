import {Tivo} from './lib/tivo.js'
import {config} from './config.js';

const doit = async () => {
    const tivo = new Tivo(config.ip, config.mak);
    await tivo.connect();
    console.log('connected');
    
    let response = await tivo.uiNavigate('x-tivo:classicui:restartDvr');
    console.log(response);

    await new Promise(resolve => setTimeout(resolve, 5000));

    response = await tivo.sendKey('thumbsDown');
    response = await tivo.sendKey('thumbsDown');
    response = await tivo.sendKey('thumbsDown');

    response = await tivo.sendKey('enter');
    console.log(response);
    
    
    tivo.disconnect();
}

doit();