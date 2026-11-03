from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
SERVICES = {"shipment-service": "8081", "courier-service": "8082", "security-service": "8083"}

def properties(path):
    result = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip() and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            if key.strip() in result:
                raise ValueError(f"Propiedad duplicada en {path.name}: {key}")
            result[key.strip()] = value.strip()
    return result

def merged(service, profile):
    return properties(ROOT/f"{service}.properties") | properties(ROOT/f"{service}-{profile}.properties")

class ConfigurationContractTest(unittest.TestCase):
    def test_six_profiles_and_ports_are_consistent(self):
        for service, port in SERVICES.items():
            for profile in ("dev", "prod"):
                with self.subTest(service=service, profile=profile):
                    config = merged(service, profile)
                    self.assertEqual(service, config["spring.application.name"])
                    self.assertEqual("${SERVER_PORT:"+port+"}", config["server.port"])
                    self.assertEqual("validate", config["spring.jpa.hibernate.ddl-auto"])
                    self.assertEqual("true", config["spring.flyway.enabled"])
                    self.assertEqual("false", config["spring.jpa.open-in-view"])

    def test_required_credentials_and_production_database(self):
        for service in SERVICES:
            for profile in ("dev", "prod"):
                config = merged(service, profile)
                self.assertEqual("${DB_USERNAME}", config["spring.datasource.username"])
                self.assertEqual("${DB_PASSWORD}", config["spring.datasource.password"])
            self.assertEqual("${DB_URL}", merged(service,"prod")["spring.datasource.url"])

    def test_compose_uses_dns_and_clients_use_exact_contract_keys(self):
        for service in SERVICES:
            config = merged(service,"dev")
            self.assertIn(service.removesuffix("-service")+"-db:3306/",config["spring.datasource.url"])
            self.assertNotIn("localhost",config["spring.datasource.url"])
        config = merged("shipment-service","dev")
        self.assertEqual("${COURIER_SERVICE_URL:http://courier-service:8082}",config["logitrack.courier.base-url"])
        self.assertNotIn("logitrack.courier-service.url",config)
        self.assertEqual("${JWT_PUBLIC_KEY_LOCATION}", config["logitrack.security.public-key-location"])
        for suffix in ("key-id", "issuer", "audience"):
            self.assertIn("logitrack.security."+suffix,config)

    def test_prod_has_required_fee_and_dependency_values(self):
        config=merged("shipment-service","prod")
        for key,var in (("base","FEE_BASE"),("price-per-kg","FEE_PRICE_PER_KG"),("volumetric-divisor","FEE_VOLUMETRIC_DIVISOR")):
            self.assertEqual("${"+var+"}",config["logitrack.fee."+key])
        self.assertEqual("${COURIER_SERVICE_URL}",config["logitrack.courier.base-url"])
        self.assertEqual("${JWT_TTL}",merged("security-service","prod")["logitrack.security.token-ttl"])

    def test_no_private_material_or_credential_defaults(self):
        for path in ROOT.glob("*.properties"):
            text=path.read_text(encoding="utf-8")
            self.assertNotIn("PRIVATE KEY",text)
            self.assertNotRegex(text,r"https?://[^/\s:]+:[^@\s]+@")
            for key,value in properties(path).items():
                if any(word in key for word in ("password", "username", "private-key")):
                    self.assertRegex(value,r"^\$\{[A-Z_]+\}$")
            if not path.name.startswith("security-service"):
                self.assertNotIn("private-key",text)

    def test_actuator_never_exposes_environment(self):
        for service in SERVICES:
            for profile in ("dev","prod"):
                config=merged(service,profile)
                self.assertEqual("health",config["management.endpoints.web.exposure.include"])
                self.assertEqual("never",config["management.endpoint.health.show-details"])
                self.assertEqual("never",config["management.endpoint.health.show-components"])

    def test_api_gateway_configuration_and_cors(self):
        for profile in ("dev", "prod"):
            config = merged("api-gateway", profile)
            self.assertEqual("api-gateway", config["spring.application.name"])
            self.assertEqual("${SERVER_PORT:8080}", config["server.port"])
            self.assertIn("gateway", config["management.endpoints.web.exposure.include"])
            self.assertIn("logitrack.gateway.cors.allowed-origins", config)
            self.assertEqual("GET,POST,PUT,DELETE,PATCH,OPTIONS", config["logitrack.gateway.cors.allowed-methods"])
            self.assertEqual("true", config["logitrack.gateway.cors.allow-credentials"])
            self.assertEqual("3600", config["logitrack.gateway.cors.max-age"])
        dev_config = merged("api-gateway", "dev")
        self.assertIn("localhost:8065", dev_config["eureka.client.service-url.defaultZone"])
        prod_config = merged("api-gateway", "prod")
        self.assertIn("eureka-server:8065", prod_config["eureka.client.service-url.defaultZone"])
        self.assertIn("https://logitrack.com", prod_config["logitrack.gateway.cors.allowed-origins"])

if __name__ == "__main__":
    unittest.main()
