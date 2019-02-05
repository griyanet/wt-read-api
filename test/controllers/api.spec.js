/* eslint-env mocha */
/* eslint-disable no-unused-expressions */
const { expect } = require('chai');
const request = require('supertest');
const { config } = require('../../src/config');

describe('API', function () {
  let server;
  beforeEach(() => {
    server = require('../../src/index');
  });
  afterEach(() => {
    server.close();
  });

  it('GET /', async () => {
    await request(server)
      .get('/')
      .expect((res) => {
        expect(res.body).to.have.property('docs');
        expect(res.body).to.have.property('info');
        expect(res.body).to.have.property('version');
        expect(res.body).to.have.property('config', process.env.WT_CONFIG);
        expect(res.body).to.have.property('wtIndexAddress', config.wtIndexAddress);
        expect(res.body).to.have.property('ethNetwork', config.ethNetwork);
      })
      .expect(200);
  });

  it('should respond with CORS headers', async () => {
    await request(server)
      .get('/')
      .expect((res) => {
        expect(res.headers).to.have.property('access-control-allow-origin', '*');
      })
      .expect(200);
  });

  it('GET /docs', async () => {
    await request(server)
      .get('/docs/')
      .expect('content-type', /html/i)
      .expect((res) => {
        expect(res.text).to.not.be.empty;
      })
      .expect(200);
  });

  it('GET /random-endpoint', async () => {
    await request(server)
      .get('/random-endpoint')
      .expect('content-type', /json/i)
      .expect((res) => {
        expect(res.body).to.have.property('code', '#notFound');
      })
      .expect(404);
  });
});
