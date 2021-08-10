import {Tivo} from './lib/tivo.js'
import {config} from './config.js';

const doit = async () => {
    const tivo = new Tivo(config.ip, config.mak);
    await tivo.connect();
    console.log('connected');
    
    let body = await tivo.sendRequest(
        'uiNavigate',
        {
            uri: 'x-tivo:classicui:restartDvr'
        }
    );

    await new Promise(resolve => setTimeout(resolve, 5000));

    body = await tivo.sendRequest(
        'keyEventSend',
        {event: 'thumbsDown'}
    );
    console.log(body);
    body = await tivo.sendRequest(
        'keyEventSend',
        {event: 'thumbsDown'}
    );
    body = await tivo.sendRequest(
        'keyEventSend',
        {event: 'thumbsDown'}
    );

    body = await tivo.sendRequest(
        'keyEventSend',
        {event: 'enter'}
    );
    
    
    //console.log(body);
    tivo.disconnect();
}

doit();