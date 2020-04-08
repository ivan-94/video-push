importScripts('./jsmpeg.js');

this.window = this

this.addEventListener('message', (evt) => {
  const data = evt.data;

  switch (data.type) {
    // 创建播放器
    case 'create':
      const { url, canvas, ...config } = data.data;
      this.id = url;
      this.player = new JSMpeg.Player(url, {
        canvas,
        audio: false,
        pauseWhenHidden: false,
        videoBufferSize: 10 * 1024 * 1024,
        ...config,
      });

      break;

    // 销毁播放器
    case 'destroy':
      try {
        if (this.player) {
          this.player.destroy();
        }
        this.postMessage({ type: 'destroyed' });
      } catch (err) {
        console.log(LOGGER_FREFIX + '销毁失败: ', global.id, err);
        this.postMessage({
          type: 'fatal',
          data: err,
        });
      }

      break;
  }
});

// 就绪
this.postMessage({ type: 'ready', data: {} });
