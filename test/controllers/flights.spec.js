/* eslint-env mocha */
const { expect } = require('chai');
const request = require('supertest');
const wtJsLibsWrapper = require('../../src/services/wt-js-libs');
const { AIRLINE_SEGMENT_ID } = require('../../src/constants');
const {
  deployAirlineIndex,
  deployFullAirline,
} = require('../../management/local-network');
const {
  AIRLINE_DESCRIPTION,
  AIRLINE_FLIGHTS,
  FLIGHT_INSTANCES,
} = require('../utils/test-data');

describe('Flights', function () {
  let server;
  let wtLibsInstance;
  let address, indexContract;

  beforeEach(async () => {
    server = require('../../src/index');
    wtLibsInstance = wtJsLibsWrapper.getInstance(AIRLINE_SEGMENT_ID);
    indexContract = await deployAirlineIndex();
    wtJsLibsWrapper._setIndexAddress(indexContract.address, AIRLINE_SEGMENT_ID);
    address = await deployFullAirline(await wtLibsInstance.getOffChainDataClient('in-memory'), indexContract, AIRLINE_DESCRIPTION, AIRLINE_FLIGHTS, FLIGHT_INSTANCES);
  });

  afterEach(() => {
    server.close();
  });

  describe('GET /airlines/:airlineAddress/flights', () => {
    it('should return flight list', async () => {
      await request(server)
        .get(`/airlines/${address}/flights`)
        .set('content-type', 'application/json')
        .set('accept', 'application/json')
        .expect((res) => {
          expect(res.status).to.be.eql(200);
          expect(res.body).to.have.property('updatedAt');
          expect(res.body).to.have.property('items');
          expect(res.body.items.length).to.eql(2);
          for (let flight of res.body.items) {
            expect(flight).to.have.property('id');
            expect(flight).to.have.property('origin');
            expect(flight).to.have.property('destination');
            expect(flight).to.have.property('segments');
            expect(flight).to.not.have.property('flightInstances');
          }
        });
    });

    it('should return flight list with instances', async () => {
      await request(server)
        .get(`/airlines/${address}/flights?fields=flightInstances`)
        .set('content-type', 'application/json')
        .set('accept', 'application/json')
        .expect((res) => {
          expect(res.status).to.be.eql(200);
          expect(res.body).to.have.property('updatedAt');
          expect(res.body).to.have.property('items');
          expect(res.body.items.length).to.eql(2);
          for (let flight of res.body.items) {
            expect(flight).to.have.property('id');
            expect(flight).to.have.property('origin');
            expect(flight).to.have.property('destination');
            expect(flight).to.have.property('segments');
            expect(flight).to.have.property('flightInstances');
            expect(flight.flightInstances.length).to.eql(2);
          }
        });
    });

    it('should return 404 for unknown airline id', async () => {
      let airlineId = '0x994afd347B160be3973B41F0A144819496d175e9';
      await request(server)
        .get(`/airlines/${airlineId}/flights`)
        .set('content-type', 'application/json')
        .set('accept', 'application/json')
        .expect(404);
    });

    it('should return 404 if airline has no flights', async () => {
      const airline = await deployFullAirline(await wtLibsInstance.getOffChainDataClient('in-memory'), indexContract, AIRLINE_DESCRIPTION);
      await request(server)
        .get(`/airlines/${airline}/flights`)
        .set('content-type', 'application/json')
        .set('accept', 'application/json')
        .expect(404);
    });
  });

  describe('GET /airlines/:airlineAddress/flights/:flightId/meta', () => {
    it('should return flight instances', async () => {
      const flightId = 'IeKeix6G';
      await request(server)
        .get(`/airlines/${address}/flights/${flightId}/meta/`)
        .set('content-type', 'application/json')
        .set('accept', 'application/json')
        .expect((res) => {
          expect(res.status).to.be.eql(200);
          expect(res.body.flightInstancesUri).to.match(/^in-memory:\/\//);
        });
    });

    it('should return 404 for unknown flight id', async () => {
      const flightId = 'flight-000';
      await request(server)
        .get(`/airlines/${address}/flights/${flightId}/meta/`)
        .set('content-type', 'application/json')
        .set('accept', 'application/json')
        .expect(404)
        .expect((res) => {
          expect(res.body.code).to.eql('#flightNotFound');
        });
    });
  });

  describe('GET /airlines/:airlineAddress/flights/:flightId', () => {
    it('should return a flight', async () => {
      const flightId = 'IeKeix6G';
      await request(server)
        .get(`/airlines/${address}/flights/${flightId}`)
        .set('content-type', 'application/json')
        .set('accept', 'application/json')
        .expect((res) => {
          expect(res.status).to.be.eql(200);
          expect(res.body).to.have.property('id', flightId);
          expect(res.body).to.have.property('origin', 'PRG');
          expect(res.body).to.have.property('destination', 'LAX');
          expect(res.body).to.not.have.property('flightInstances');
          expect(res.body).to.not.have.property('flightInstancesUri');
        });
    });

    it('should return a flight with instances', async () => {
      const flightId = 'IeKeix6G';
      await request(server)
        .get(`/airlines/${address}/flights/${flightId}?fields=flightInstances`)
        .set('content-type', 'application/json')
        .set('accept', 'application/json')
        .expect((res) => {
          expect(res.status).to.be.eql(200);
          expect(res.body).to.have.property('id', flightId);
          expect(res.body).to.have.property('origin', 'PRG');
          expect(res.body).to.have.property('destination', 'LAX');
          expect(res.body).to.have.property('flightInstances');
          expect(res.body).to.not.have.property('flightInstancesUri');
          expect(res.body.flightInstances.length).to.eql(2);
          for (let instance of res.body.flightInstances) {
            expect(instance).to.have.property('id');
            expect(instance).to.have.property('departureDateTime');
            expect(instance).to.have.property('bookingClasses');
          }
        });
    });

    it('should return 404 for unknown flight id', async () => {
      const flightId = 'flight-000';
      await request(server)
        .get(`/airlines/${address}/flights/${flightId}`)
        .set('content-type', 'application/json')
        .set('accept', 'application/json')
        .expect(404);
    });

    it('should return 404 if airline has no flights', async () => {
      const airline = await deployFullAirline(await wtLibsInstance.getOffChainDataClient('in-memory'), indexContract, AIRLINE_DESCRIPTION);
      const flightId = 'IeKeix6G';
      await request(server)
        .get(`/airlines/${airline}/flights/${flightId}`)
        .set('content-type', 'application/json')
        .set('accept', 'application/json')
        .expect(404);
    });
  });
});