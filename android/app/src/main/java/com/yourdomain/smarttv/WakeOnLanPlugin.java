package com.yourdomain.smarttv;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.JSObject;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;

@CapacitorPlugin(name = "WakeOnLan")
public class WakeOnLanPlugin extends Plugin {

    @PluginMethod
    public void wake(PluginCall call) {
        String mac = call.getString("mac");
        String broadcast = call.getString("broadcast", "255.255.255.255");

        if (mac == null || mac.isEmpty()) {
            call.reject("MAC address is required");
            return;
        }

        new Thread(() -> {
            try {
                byte[] macBytes = getMacBytes(mac);
                // Magic packet: 6 bytes of 0xFF followed by MAC address repeated 16 times
                byte[] packet = new byte[6 + 16 * macBytes.length];
                for (int i = 0; i < 6; i++) packet[i] = (byte) 0xFF;
                for (int i = 6; i < packet.length; i += macBytes.length) {
                    System.arraycopy(macBytes, 0, packet, i, macBytes.length);
                }

                InetAddress address = InetAddress.getByName(broadcast);
                DatagramPacket dp = new DatagramPacket(packet, packet.length, address, 9);
                DatagramSocket socket = new DatagramSocket();
                socket.setBroadcast(true);
                socket.send(dp);
                socket.close();

                JSObject result = new JSObject();
                result.put("success", true);
                call.resolve(result);
            } catch (Exception e) {
                call.reject("WoL failed: " + e.getMessage());
            }
        }).start();
    }

    private byte[] getMacBytes(String macStr) throws IllegalArgumentException {
        String[] hex = macStr.split("[:\\-]");
        if (hex.length != 6) throw new IllegalArgumentException("Invalid MAC address format");
        byte[] bytes = new byte[6];
        for (int i = 0; i < 6; i++) {
            bytes[i] = (byte) Integer.parseInt(hex[i], 16);
        }
        return bytes;
    }
}
